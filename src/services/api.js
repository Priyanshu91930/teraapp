const TERABOX_PATTERN = /(https?:\/\/)?(www\.)?([a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+)\/s\/([A-Za-z0-9_-]+)/;

export function extractTeraboxUrl(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  const match = trimmed.match(TERABOX_PATTERN);
  return match ? match[0] : null;
}

export async function resolveTeraboxLink(baseUrl, url, quality = 'auto') {
  if (!baseUrl) {
    throw new Error('API server URL is not set. Open Settings and add your server URL.');
  }

  const endpoint = baseUrl.replace(/\/+$/, '');
  const query = new URLSearchParams({ url, quality });
  const res = await fetch(`${endpoint}/parse?${query.toString()}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Server error: ${res.status}`);
  }

  const json = await res.json();

  if (json && json.error) {
    throw new Error(json.error);
  }

  const data = json.data || json;
  const file = Array.isArray(data.list) ? data.list[0] : data;

  return {
    name: file?.name || json.name || 'video.mp4',
    size: file?.size || json.size || 'Unknown',
    thumbnail: file?.thumbnail || file?.thumb || json.thumbnail || '',
    downloadUrl: file?.dlink || file?.download_url || file?.url || json.dlink || json.download_url || '',
  };
}
