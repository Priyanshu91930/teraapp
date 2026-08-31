import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { addHistoryItem, getHistory } from './storage';
import { SegmentedDownloader, probeRangeSupport, computeConnections } from './segmentedDownload';
import {
  showDownloadNotification,
  updateDownloadNotification,
  showDownloadCompleteNotification,
  showDownloadFailedNotification,
  dismissDownloadNotification,
} from './notificationManager';

// In-memory mapping of active download instances and listeners
const activeInstances = {};
const listeners = {};
const lastProgressTime = {};

// Helper to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0 || !bytes || isNaN(bytes)) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (isNaN(i) || i < 0) return '0 B';
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Helper to parse size string (e.g. "480.22 MB") back to bytes
function parseSizeToBytes(sizeStr) {
  if (!sizeStr || typeof sizeStr !== 'string') return 0;
  const match = sizeStr.trim().match(/^([0-9.]+)\s*([A-Za-z]+)$/);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const multipliers = {
    'B': 1,
    'KB': 1024,
    'MB': 1024 * 1024,
    'GB': 1024 * 1024 * 1024,
    'TB': 1024 * 1024 * 1024 * 1024
  };
  return value * (multipliers[unit] || 1);
}

// Helper to format remaining seconds into human-readable duration
function formatTimeRemaining(seconds) {
  if (!seconds || seconds <= 0 || isNaN(seconds)) return '--';
  const secs = Math.round(seconds);
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;

  if (d > 0) {
    return `${d}d ${h}h`;
  }
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

// Notify all listeners of changes to an active download
function notifyListeners(id, data) {
  if (listeners[id]) {
    listeners[id].forEach((cb) => {
      try {
        cb(data);
      } catch (e) {
        // ignore
      }
    });
  }
}

// Main progress callback used by the legacy single-connection downloader
function createProgressCallback(id, fileName, totalSizeStr, startTime) {
  let lastNotifUpdate = 0;
  return (progressEvent) => {
    lastProgressTime[id] = Date.now();
    const written = progressEvent.totalBytesWritten;
    let total = progressEvent.totalBytesExpectedToWrite;
    
    // Fallback if total bytes expected to write is missing or invalid from CDN
    if (!total || isNaN(total) || total <= 0) {
      total = parseSizeToBytes(totalSizeStr);
    }
    
    const now = Date.now();
    const elapsed = (now - startTime) / 1000;
    
    let speed = '0 KB/s';
    let timeRemaining = '--';
    if (elapsed > 0) {
      const bytesPerSec = written / elapsed;
      speed = formatBytes(bytesPerSec) + '/s';
      const remainingBytes = total - written;
      const remSeconds = bytesPerSec > 0 && remainingBytes > 0 ? remainingBytes / bytesPerSec : 0;
      timeRemaining = formatTimeRemaining(remSeconds);
    }

    const progress = total > 0 ? written / total : 0;
    const bytesWrittenStr = formatBytes(written);
    let totalBytesStr = formatBytes(total);
    if (!total || isNaN(total) || total <= 0 || totalBytesStr === '0 B' || totalBytesStr.includes('NaN')) {
      totalBytesStr = totalSizeStr || 'Unknown';
    }

    const update = {
      progress,
      downloadSpeed: speed,
      timeRemaining,
      bytesWritten: bytesWrittenStr,
      totalBytes: totalBytesStr,
      status: 'downloading',
    };

    notifyListeners(id, update);

    // Update notification every 2 seconds to avoid spam
    if (now - lastNotifUpdate > 2000) {
      lastNotifUpdate = now;
      updateDownloadNotification(id, fileName, progress, bytesWrittenStr, totalBytesStr, speed, timeRemaining);
    }
  };
}

// Legacy single-connection downloader (fallback / small files)
function runLegacy(id, name, fileUri, downloadUrl, downloadHeaders, size) {
  const startTime = Date.now();
  const download = FileSystem.createDownloadResumable(
    downloadUrl,
    fileUri,
    { headers: downloadHeaders },
    createProgressCallback(id, name, size, startTime)
  );

  activeInstances[id] = download;

  (async () => {
    try {
      const result = await download.downloadAsync();
      if (result) {
        if (result.status < 200 || result.status >= 300) {
          throw new Error(`Server returned HTTP status ${result.status}`);
        }
        await updateHistoryStatus(id, 'downloaded', 1);
        notifyListeners(id, { status: 'downloaded', progress: 1 });
        await showDownloadCompleteNotification(id, name);
        delete activeInstances[id];
        delete lastProgressTime[id];
      }
    } catch (e) {
      if (e.message && e.message.includes('paused')) {
        return;
      }
      await updateHistoryStatus(id, 'failed', 0);
      notifyListeners(id, { status: 'failed', progress: 0, error: e.message });
      await showDownloadFailedNotification(id, name);
      delete activeInstances[id];
      delete lastProgressTime[id];
    }
  })();
}

// Fast multi-connection (segmented) downloader for servers that support Range requests
function runSegmented(id, name, fileUri, downloadUrl, downloadHeaders, totalBytes, connections, size) {
  const startTime = Date.now();
  const progressCallback = createProgressCallback(id, name, size, startTime);

  const seg = new SegmentedDownloader({
    url: downloadUrl,
    fileUri,
    headers: downloadHeaders,
    totalBytes,
    connections,
    onProgress: (downloaded) => {
      progressCallback({
        totalBytesWritten: downloaded,
        totalBytesExpectedToWrite: totalBytes,
      });
    },
  });

  activeInstances[id] = {
    type: 'segmented',
    seg,
    pause: async () => {
      seg.pause();
      const resumeData = JSON.stringify({
        type: 'segmented',
        url: downloadUrl,
        fileUri,
        headers: downloadHeaders,
        totalBytes,
        connections,
      });
      await updateHistoryStatus(id, 'paused', null, resumeData);
      notifyListeners(id, { status: 'paused' });
      await dismissDownloadNotification(id);
    },
    cancel: async () => {
      seg.cancel();
      await seg.cleanupParts();
    },
  };

  (async () => {
    try {
      const result = await seg.start();
      if (result.status === 'completed') {
        await updateHistoryStatus(id, 'downloaded', 1);
        notifyListeners(id, { status: 'downloaded', progress: 1 });
        await showDownloadCompleteNotification(id, name);
      }
      delete activeInstances[id];
    } catch (e) {
      if (seg.cancelled || seg.paused) {
        delete activeInstances[id];
        delete lastProgressTime[id];
        return;
      }
      // Segmented download failed — clean up parts and fall back to a single connection
      await seg.cleanupParts();
      try {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      } catch (err) {
        // ignore
      }
      delete activeInstances[id];
      delete lastProgressTime[id];
      runLegacy(id, name, fileUri, downloadUrl, downloadHeaders, size);
    }
  })();
}

export async function startDownload(name, downloadUrl, size = 'Unknown', thumbnail = '', downloadHeaders = {}) {
  const safeName = name.replace(/[^\w\-. ]/g, '_');
  const fileUri = FileSystem.documentDirectory + safeName;
  const id = String(Date.now());

  // Add a new entry to the history table as downloading
  const historyItem = {
    id,
    name,
    size,
    url: downloadUrl,
    thumbnail,
    status: 'downloading',
    progress: 0,
    downloadedAt: new Date().toISOString(),
    downloadHeaders: JSON.stringify(downloadHeaders)
  };

  // Pre-load items into local storage
  const history = await getHistory();
  const next = [historyItem, ...history];
  await AsyncStorage.setItem('@teraapp/history', JSON.stringify(next.slice(0, 100)));

  // Show initial notification
  await showDownloadNotification(id, name, 0);

  // Try a fast segmented (multi-connection) download when the server supports Range requests
  // Disable segmented downloading for proxy URLs to prevent Hostinger LiteSpeed 403 concurrent connection blocks
  const isProxied = downloadUrl.includes('download.php');
  const probe = !isProxied ? await probeRangeSupport(downloadUrl, downloadHeaders) : { supported: false };
  if (probe.supported && probe.total > 0) {
    const connections = computeConnections(probe.total);
    if (connections > 1) {
      runSegmented(id, name, fileUri, probe.url || downloadUrl, downloadHeaders, probe.total, connections, size);
      return id;
    }
  }

  runLegacy(id, name, fileUri, downloadUrl, downloadHeaders, size);
  return id;
}

export async function pauseDownload(id) {
  const inst = activeInstances[id];
  if (!inst) return;

  if (inst.type === 'segmented') {
    try {
      await inst.pause();
    } catch (e) {
      console.error('Failed to pause download:', e);
    }
    return;
  }

  try {
    const pauseResult = await inst.pauseAsync();
    // Save resumeData to the history item so we can resume later
    await updateHistoryStatus(id, 'paused', null, JSON.stringify(pauseResult));
    notifyListeners(id, { status: 'paused' });
    await dismissDownloadNotification(id);
  } catch (e) {
    console.error('Failed to pause download:', e);
  }
}

export async function resumeDownload(id) {
  // Read history item to get resumeData
  const history = await getHistory();
  const item = history.find((h) => h.id === id);
  if (!item || !item.resumeData) return;

  let resumeData = null;
  try {
    resumeData = JSON.parse(item.resumeData);
  } catch (e) {
    resumeData = null;
  }

  // Resume a segmented download from its saved part files
  if (resumeData && resumeData.type === 'segmented' && resumeData.totalBytes > 0) {
    const startTime = Date.now();
    const progressCallback = createProgressCallback(id, item.name, item.size, startTime);

    const seg = new SegmentedDownloader({
      url: resumeData.url,
      fileUri: resumeData.fileUri,
      headers: resumeData.headers || {},
      totalBytes: resumeData.totalBytes,
      connections: resumeData.connections || computeConnections(resumeData.totalBytes),
      onProgress: (downloaded) => {
        progressCallback({
          totalBytesWritten: downloaded,
          totalBytesExpectedToWrite: resumeData.totalBytes,
        });
      },
    });

    activeInstances[id] = {
      type: 'segmented',
      seg,
      pause: async () => {
        seg.pause();
        await updateHistoryStatus(id, 'paused', null, item.resumeData);
        notifyListeners(id, { status: 'paused' });
        await dismissDownloadNotification(id);
      },
      cancel: async () => {
        seg.cancel();
        await seg.cleanupParts();
      },
    };

    await updateHistoryStatus(id, 'downloading');
    notifyListeners(id, { status: 'downloading' });

    (async () => {
      try {
        const result = await seg.start();
        if (result.status === 'completed') {
          await updateHistoryStatus(id, 'downloaded', 1);
          notifyListeners(id, { status: 'downloaded', progress: 1 });
          await showDownloadCompleteNotification(id, item.name);
        }
        delete activeInstances[id];
      } catch (e) {
        if (seg.cancelled || seg.paused) {
          delete activeInstances[id];
          return;
        }
        await seg.cleanupParts();
        try {
          await FileSystem.deleteAsync(resumeData.fileUri, { idempotent: true });
        } catch (err) {
          // ignore
        }
        delete activeInstances[id];
        runLegacy(id, item.name, resumeData.fileUri, resumeData.url, resumeData.headers || {}, item.size);
      }
    })();
    return;
  }

  // Legacy single-connection resume
  try {
    const startTime = Date.now();
    const download = FileSystem.createDownloadResumable(
      resumeData.url,
      resumeData.fileUri,
      resumeData.options,
      createProgressCallback(id, item.name, item.size, startTime),
      resumeData.resumeData
    );

    activeInstances[id] = download;
    await updateHistoryStatus(id, 'downloading');
    notifyListeners(id, { status: 'downloading' });

    (async () => {
      try {
        const result = await download.resumeAsync();
        if (result) {
          if (result.status < 200 || result.status >= 300) {
            throw new Error(`Server returned HTTP status ${result.status}`);
          }
          await updateHistoryStatus(id, 'downloaded', 1);
          notifyListeners(id, { status: 'downloaded', progress: 1 });
          await showDownloadCompleteNotification(id, item ? item.name : 'File');
          delete activeInstances[id];
        }
      } catch (e) {
        if (e.message && e.message.includes('paused')) {
          return;
        }
        await updateHistoryStatus(id, 'failed', 0);
        notifyListeners(id, { status: 'failed', progress: 0, error: e.message });
        await showDownloadFailedNotification(id, item ? item.name : 'File');
        delete activeInstances[id];
      }
    })();
  } catch (e) {
    console.error('Failed to resume download:', e);
  }
}

export async function cancelDownload(id) {
  const inst = activeInstances[id];
  if (inst) {
    try {
      if (inst.type === 'segmented') {
        inst.seg.cancel();
        await inst.seg.cleanupParts();
      } else {
        await inst.pauseAsync();
      }
    } catch (e) {
      // ignore
    }
  }

  // Remove the history item and local file
  const history = await getHistory();
  const item = history.find((h) => h.id === id);
  if (item) {
    const safeName = item.name.replace(/[^\w\-. ]/g, '_');
    const fileUri = FileSystem.documentDirectory + safeName;
    try {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    } catch (e) {
      // ignore
    }
  }

  const next = history.filter((h) => h.id !== id);
  await AsyncStorage.setItem('@teraapp/history', JSON.stringify(next));

  notifyListeners(id, { status: 'cancelled' });
  await dismissDownloadNotification(id);
  delete activeInstances[id];
}

// Utility to update history database entry status
async function updateHistoryStatus(id, status, progress = null, resumeDataJson = null) {
  const history = await getHistory();
  const next = history.map((item) => {
    if (item.id === id) {
      const updated = { ...item, status };
      if (progress !== null) updated.progress = progress;
      if (resumeDataJson !== null) updated.resumeData = resumeDataJson;
      return updated;
    }
    return item;
  });
  await AsyncStorage.setItem('@teraapp/history', JSON.stringify(next));
}

// Register real-time progress callbacks
export function addDownloadListener(id, cb) {
  if (!listeners[id]) {
    listeners[id] = [];
  }
  listeners[id].push(cb);
}

export function removeDownloadListener(id, cb) {
  if (listeners[id]) {
    listeners[id] = listeners[id].filter((x) => x !== cb);
  }
}

export function isDownloading(id) {
  return !!activeInstances[id];
}

// Stalled download auto-recovery mechanism (recovers background freezes)
export async function forcePauseDownload(id) {
  const inst = activeInstances[id];
  if (!inst) return;

  try {
    if (inst.type === 'segmented') {
      await inst.pause();
    } else {
      await inst.pauseAsync();
    }
  } catch (e) {
    console.log('[Manager] Direct native pause failed, applying manual cleanup:', e.message);
    // Manual recovery: Update state to paused
    await updateHistoryStatus(id, 'paused');
    notifyListeners(id, { status: 'paused' });
    await dismissDownloadNotification(id);
  } finally {
    delete activeInstances[id];
    delete lastProgressTime[id];
  }
}

export async function verifyActiveDownloads() {
  const now = Date.now();
  for (const id of Object.keys(activeInstances)) {
    const lastUpdate = lastProgressTime[id] || 0;
    // If no progress updates for more than 10 seconds, the download has stalled/frozen
    if (lastUpdate > 0 && now - lastUpdate > 10000) {
      console.log(`[Manager] Stalled background download detected: ${id}. Pausing/resetting.`);
      await forcePauseDownload(id);
    }
  }
}

