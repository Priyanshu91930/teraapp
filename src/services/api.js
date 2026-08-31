const TERABOX_PATTERN = /(https?:\/\/)?(www\.)?([a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+)\/s\/([A-Za-z0-9_-]+)/;

export function extractTeraboxUrl(text) {
  const trimmed = (text || '').trim().replace(/[\s\r\n\t]/g, '');
  if (!trimmed) return null;
  const match = trimmed.match(TERABOX_PATTERN);
  return match ? match[0] : null;
}

export async function resolveTeraboxLink(baseUrl, url, quality = 'auto') {
  if (!baseUrl) {
    throw new Error('API server URL is not set. Open Settings and add your server URL.');
  }

  const endpoint = baseUrl.replace(/\/+$/, '');
  const query = new URLSearchParams({ url, quality, from: 'app' });
  const res = await fetch(`${endpoint}/parse?${query.toString()}`, {
    method: 'GET',
    headers: { 
      'Content-Type': 'application/json',
      'x-api-key': 'AnihubTeraSecureKey2026_xYz',
      'x-client-type': 'android_app',
      'x-client-source': 'app'
    },
  });

  if (!res.ok) {
    let errMsg = `Server error: ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson && (errJson.error || errJson.message)) {
        errMsg = errJson.error || errJson.message;
      }
    } catch (e) {}
    throw new Error(errMsg);
  }

  const json = await res.json();

  if (json && json.error) {
    throw new Error(json.error);
  }

  const data = json.data || json;
  const file = Array.isArray(data.list) ? data.list[0] : data;
  const baseHeaders = json.downloadHeaders || {};

  const rawItems = Array.isArray(data.list) && data.list.length > 0
    ? data.list
    : (json.dlink || json.download_url || json.url ? [json] : []);

  const list = rawItems
    .map((item) => {
      const rawDlink = item.dlink || item.download_url || item.url || '';
      return {
        ...item,
        dlink: rawDlink,
        download_url: rawDlink,
        downloadHeaders: baseHeaders,
        stream_url: item.stream_url || '',
      };
    })
    .filter((item) => item.dlink);

  const resolvedUrl = list.length > 0 ? list[0].dlink : (file?.dlink || file?.download_url || json.downloadUrl || json.dlink || '');
  const resolvedHeaders = list.length > 0 ? list[0].downloadHeaders : baseHeaders;
  const resolvedStreamUrl = list.length > 0 ? list[0].stream_url : (json.stream_url || '');

  return {
    name: file?.name || json.name || 'video.mp4',
    size: file?.size || json.size || 'Unknown',
    thumbnail: file?.thumbnail || file?.thumb || json.thumbnail || '',
    downloadUrl: resolvedUrl,
    dlink: resolvedUrl,
    downloadHeaders: resolvedHeaders,
    stream_url: resolvedStreamUrl,
    list,
  };
}

export async function fetchStats(baseUrl) {
  try {
    if (!baseUrl) return null;
    const endpoint = baseUrl.replace(/\/+$/, '');
    const res = await fetch(`${endpoint}/stats`, {
      headers: {
        'x-api-key': 'AnihubTeraSecureKey2026_xYz'
      }
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.log('[API] Failed to fetch stats:', e.message);
  }
  return null;
}

export async function trackActivity(baseUrl, type) {
  try {
    if (!baseUrl) return;
    const endpoint = baseUrl.replace(/\/+$/, '');
    await fetch(`${endpoint}/track?type=${type}`, { 
      method: 'POST',
      headers: {
        'x-api-key': 'AnihubTeraSecureKey2026_xYz'
      }
    });
  } catch (e) {
    console.log('[API] Failed to track activity:', e.message);
  }
}
