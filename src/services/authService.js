import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_STORAGE_KEY = '@teraapp_user_profile';
const TOKEN_STORAGE_KEY = '@teraapp_session_token';
const API_BASE_URL = 'https://teraapi-six.vercel.app';

export async function getStoredUser() {
  try {
    const json = await AsyncStorage.getItem(USER_STORAGE_KEY);
    return json ? JSON.parse(json) : null;
  } catch (e) {
    return null;
  }
}

export async function setStoredUser(user) {
  try {
    if (user) {
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      await AsyncStorage.removeItem(USER_STORAGE_KEY);
    }
  } catch (e) {}
}

export async function syncGoogleUser(email, name = '', avatar = '', googleId = '') {
  if (!email) return { success: false, error: 'No email provided' };
  
  const MAX_RETRIES = 2;
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[AuthSync Debug] Syncing user ${email} (Attempt ${attempt}/${MAX_RETRIES})...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

      const response = await fetch(`${API_BASE_URL}/api/auth/google-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, name, avatar, googleId }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();
      console.log('[AuthSync Debug] Response:', data?.success ? 'Success' : data?.error);

      if (data.success && data.user) {
        if (data.token) {
          await AsyncStorage.setItem(TOKEN_STORAGE_KEY, data.token);
        }
        await setStoredUser(data.user);
        return { success: true, user: data.user };
      } else {
        lastError = data.error || 'Server rejected user sync';
      }
    } catch (e) {
      console.error(`[AuthSync Debug] Attempt ${attempt} failed:`, e.message);
      lastError = e.message || 'Network fetch failed';
      if (attempt < MAX_RETRIES) {
        await new Promise((res) => setTimeout(res, 1000)); // wait 1s before retry
      }
    }
  }

  return { success: false, error: lastError };
}

export async function fetchFreshUserStatus(email) {
  if (!email) return null;
  const res = await syncGoogleUser(email);
  return res.success ? res.user : null;
}

export async function logoutUser() {
  try {
    await AsyncStorage.removeItem(USER_STORAGE_KEY);
    await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
    await AsyncStorage.removeItem('@teraapp/history');
  } catch (e) {}
}

export function checkIsPremium(user) {
  if (!user) return false;
  if (user.isPremium === true) return true;
  if (user.premiumStatus === 'premium') return true;
  if (user.plan && user.plan.toLowerCase() !== 'free') return true;
  return false;
}
