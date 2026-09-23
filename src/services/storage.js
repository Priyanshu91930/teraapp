import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStoredUser } from './authService';

const HISTORY_KEY = '@teraapp/history';
const SETTINGS_KEY = '@teraapp/settings';
const API_BASE_URL = 'https://teraapi-six.vercel.app';

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

export async function getHistory(userEmail) {
  let email = userEmail;
  if (!email) {
    const user = await getStoredUser();
    if (user && user.email) email = user.email;
  }

  // If user is signed out, return empty list to prevent leaking previous user's history
  if (!email) {
    return [];
  }

  // If user is logged in, fetch cloud history from MongoDB
  try {
    const res = await fetch(`${API_BASE_URL}/api/history?email=${encodeURIComponent(email)}`);
    if (res.ok) {
      const rawText = await res.text();
      try {
        const data = JSON.parse(rawText);
        if (data && data.success && Array.isArray(data.history)) {
          await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(data.history.slice(0, 100)));
          return data.history;
        }
      } catch (jsonErr) {}
    }
  } catch (e) {
    console.log('MongoDB history fetch error, fallback to local:', e.message);
  }

  // Fallback to local storage for logged-in user
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export async function addHistoryItem(item, userEmail) {
  let email = userEmail;
  if (!email) {
    const user = await getStoredUser();
    if (user && user.email) email = user.email;
  }

  // Note: dlink is intentionally NOT saved to MongoDB for security
  const newItem = {
    id: item.id || String(Date.now()),
    name: item.name || 'TeraBox File',
    size: item.size || 'Unknown',
    url: item.url || '',
    thumbnail: item.thumbnail || '',
    status: item.status || 'resolved',
    downloadedAt: item.downloadedAt || new Date().toISOString(),
  };

  // If user is logged in, sync with MongoDB database
  if (email && newItem.url) {
    try {
      await fetch(`${API_BASE_URL}/api/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          name: newItem.name,
          size: newItem.size,
          thumbnail: newItem.thumbnail,
          url: newItem.url,
        }),
      });
    } catch (e) {
      console.log('MongoDB history add error:', e.message);
    }
  }

  // Save to local storage as well
  const history = await getHistory(email);
  const filtered = history.filter((h) => h.name !== newItem.name && (h.url ? h.url !== newItem.url : true));
  const next = [newItem, ...filtered];
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next.slice(0, 100)));
  return next;
}

export async function removeHistoryItem(id, userEmail) {
  let email = userEmail;
  if (!email) {
    const user = await getStoredUser();
    if (user && user.email) email = user.email;
  }

  if (email) {
    try {
      await fetch(`${API_BASE_URL}/api/history?email=${encodeURIComponent(email)}&id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.log('MongoDB history remove error:', e.message);
    }
  }

  const history = await getHistory(email);
  const next = history.filter((h) => h.id !== id);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export async function clearHistory(userEmail) {
  let email = userEmail;
  if (!email) {
    const user = await getStoredUser();
    if (user && user.email) email = user.email;
  }

  if (email) {
    try {
      await fetch(`${API_BASE_URL}/api/history?email=${encodeURIComponent(email)}&clearAll=true`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.log('MongoDB history clear error:', e.message);
    }
  }

  await AsyncStorage.removeItem(HISTORY_KEY);
  return [];
}
