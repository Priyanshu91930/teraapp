import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = '@teraapp/history';
const SETTINGS_KEY = '@teraapp/settings';

export const DEFAULT_SETTINGS = {
  apiBaseUrl: 'https://teraapi-six.vercel.app',
  downloadQuality: 'auto',
  saveToGallery: false,
  autoResume: true,
};

export async function getSettings() {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed.apiBaseUrl || parsed.apiBaseUrl.includes('-8bmpmowoj-')) {
      parsed.apiBaseUrl = DEFAULT_SETTINGS.apiBaseUrl;
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...parsed, apiBaseUrl: DEFAULT_SETTINGS.apiBaseUrl }));
    }
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function getHistory() {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export async function addHistoryItem(item) {
  const history = await getHistory();
  // Filter out any duplicate item with same name or url
  const filtered = history.filter((h) => h.name !== item.name && (h.url ? h.url !== item.url : true));
  const newItem = {
    id: item.id || String(Date.now()),
    name: item.name || 'Unknown File',
    size: item.size || 'Unknown Size',
    url: item.url || '',
    dlink: item.dlink || '',
    stream_url: item.stream_url || '',
    thumbnail: item.thumbnail || '',
    status: item.status || 'resolved',
    downloadedAt: item.downloadedAt || new Date().toISOString(),
    downloadHeaders: item.downloadHeaders || '',
  };
  const next = [newItem, ...filtered];
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next.slice(0, 100)));
  return next;
}

export async function removeHistoryItem(id) {
  const history = await getHistory();
  const next = history.filter((h) => h.id !== id);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export async function clearHistory() {
  await AsyncStorage.removeItem(HISTORY_KEY);
  return [];
}
