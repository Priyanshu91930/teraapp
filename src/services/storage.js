import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = '@teraapp/history';
const SETTINGS_KEY = '@teraapp/settings';

export const DEFAULT_SETTINGS = {
  apiBaseUrl: 'https://teraapi-8bmpmowoj-priyanshus-projects-2a4066d0.vercel.app',
  downloadQuality: 'auto',
  saveToGallery: false,
  autoResume: true,
};

export async function getSettings() {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed.apiBaseUrl) {
      parsed.apiBaseUrl = DEFAULT_SETTINGS.apiBaseUrl;
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
  const next = [
    {
      id: String(Date.now()),
      name: item.name || 'Unknown',
      size: item.size || '0 B',
      url: item.url || '',
      status: item.status || 'downloaded',
      downloadedAt: new Date().toISOString(),
    },
    ...history,
  ];
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
