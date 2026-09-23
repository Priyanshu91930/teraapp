import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';

const CHUNK_SIZE = 8 * 1024 * 1024;
const MERGE_BUFFER_SIZE = 1024 * 1024;
const EMIT_INTERVAL = 200;
const EMIT_BYTES = 1024 * 1024;

export function computeConnections(totalBytes) {
  if (totalBytes >= 256 * 1024 * 1024) return 6;
  if (totalBytes >= 64 * 1024 * 1024) return 4;
  if (totalBytes >= 16 * 1024 * 1024) return 2;
  return 1;
}

export async function probeRangeSupport(url, headers = {}) {
  try {
    const finalUrl = await resolveRedirects(url, headers);
    const res = await fetch(finalUrl, {
      headers: { ...headers, Range: 'bytes=0-0' },
      redirect: 'manual',
    });
    const total = parseInt((res.headers.get('content-range') || '').split('/')[1] || '', 10);
    if (res.status === 206 && Number.isFinite(total) && total > 0) {
      return { supported: true, total, url: finalUrl };
    }
    return { supported: false, total: -1, url: finalUrl };
  } catch (e) {
    return { supported: false, total: -1, url };
  }
}

async function resolveRedirects(url, headers = {}, maxHops = 5) {
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    const controller = new AbortController();
    let res;
    try {
      res = await fetch(current, {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (e) {
      break;
    }
    const status = res.status;
    const location = res.headers.get('location');
    controller.abort();
    if (status >= 300 && status < 400) {
      if (!location) break;
      current = new URL(location, current).toString();
      continue;
    }
    break;
  }
  return current;
}

export class SegmentedDownloader {
  constructor({ url, fileUri, headers, totalBytes, connections, onProgress }) {
    this.url = url;
    this.fileUri = fileUri;
    this.headers = headers || {};
    this.totalBytes = totalBytes;
    this.connections = connections;
    this.onProgress = onProgress;
    this.controllers = [];
    this.paused = false;
    this.cancelled = false;
    this.downloaded = 0;
    this.segmentSize = Math.ceil(totalBytes / connections);
    this.partUris = Array.from({ length: connections }, (_, i) => `${fileUri}.part${i}`);
    this.lastEmit = 0;
    this.lastEmittedBytes = 0;

    // Calculate already downloaded bytes from existing part files when resuming
    let existingBytes = 0;
    for (const partUri of this.partUris) {
      try {
        const partFile = new File(partUri);
        if (partFile.exists) {
          existingBytes += partFile.size;
        }
      } catch (e) {}
    }
    this.downloaded = existingBytes;
  }

  pause() {
    this.paused = true;
    this.abortAll();
  }

  cancel() {
    this.cancelled = true;
    this.abortAll();
  }

  abortAll() {
    this.controllers.forEach((controller) => {
      try {
        controller.abort();
      } catch (e) {
        // ignore
      }
    });
  }

  emit() {
    const now = Date.now();
    if (
      now - this.lastEmit >= EMIT_INTERVAL ||
      this.downloaded - this.lastEmittedBytes >= EMIT_BYTES
    ) {
      this.lastEmit = now;
      this.lastEmittedBytes = this.downloaded;
      if (this.onProgress) this.onProgress(this.downloaded, this.totalBytes);
    }
  }

  async start() {
    if (this.connections === 1) {
      await this.runSegment(0, 0, this.totalBytes);
    } else {
      await Promise.all(
        Array.from({ length: this.connections }, (_, i) =>
          this.runSegment(i, i * this.segmentSize, Math.min((i + 1) * this.segmentSize, this.totalBytes))
        )
      );
    }
    if (this.paused) return { status: 'paused' };
    if (this.cancelled) return { status: 'cancelled' };
    await this.merge();
    return { status: 'completed' };
  }

  async runSegment(index, segStart, segEnd) {
    const partUri = this.partUris[index];
    const partFile = new File(partUri);
    if (!partFile.exists) partFile.create();
    const handle = partFile.open();
    let written = partFile.size;
    handle.offset = written;
    let start = segStart + written;
    const controller = new AbortController();
    this.controllers[index] = controller;
    try {
      while (start < segEnd && !this.paused && !this.cancelled) {
        const end = Math.min(segEnd - 1, start + CHUNK_SIZE - 1);
        let res;
        try {
          res = await fetch(this.url, {
            headers: { ...this.headers, Range: `bytes=${start}-${end}` },
            signal: controller.signal,
          });
        } catch (e) {
          if (this.paused || this.cancelled) return;
          throw e;
        }
        if (res.status !== 206) {
          throw new Error(`Server returned HTTP ${res.status} for a range request`);
        }
        written += await this.consumeBody(res, handle);
        start = segStart + written;
      }
    } finally {
      try {
        handle.close();
      } catch (e) {
        // ignore
      }
    }
  }

  async consumeBody(res, handle) {
    let consumed = 0;
    if (res.body) {
      const reader = res.body.getReader();
      while (true) {
        if (this.paused || this.cancelled) break;
        let result;
        try {
          result = await reader.read();
        } catch (e) {
          if (this.paused || this.cancelled) break;
          throw e;
        }
        if (result.done) break;
        if (result.value && result.value.length) {
          handle.writeBytes(result.value);
          consumed += result.value.length;
          this.downloaded += result.value.length;
          this.emit();
        }
      }
    } else {
      const buffer = await res.bytes();
      if (buffer && buffer.length) {
        handle.writeBytes(buffer);
        consumed += buffer.length;
        this.downloaded += buffer.length;
        this.emit();
      }
    }
    return consumed;
  }

  async merge() {
    const finalFile = new File(this.fileUri);
    if (finalFile.exists) finalFile.delete();
    finalFile.create();
    const finalHandle = finalFile.open();
    try {
      for (const partUri of this.partUris) {
        const partFile = new File(partUri);
        if (!partFile.exists) continue;
        const partHandle = partFile.open();
        try {
          let remaining = partFile.size;
          while (remaining > 0) {
            const buffer = partHandle.readBytes(Math.min(MERGE_BUFFER_SIZE, remaining));
            if (!buffer || buffer.length === 0) break;
            finalHandle.writeBytes(buffer);
            remaining -= buffer.length;
          }
        } finally {
          try {
            partHandle.close();
          } catch (e) {
            // ignore
          }
        }
        try {
          partFile.delete();
        } catch (e) {
          // ignore
        }
      }
    } finally {
      try {
        finalHandle.close();
      } catch (e) {
        // ignore
      }
    }
  }

  async cleanupParts() {
    for (const partUri of this.partUris) {
      try {
        const partFile = new File(partUri);
        if (partFile.exists) partFile.delete();
      } catch (e) {
        // ignore
      }
    }
  }
}
