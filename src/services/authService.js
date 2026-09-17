import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_STORAGE_KEY = '@teraapp_user_profile';
const TOKEN_STORAGE_KEY = '@teraapp_session_token';
const API_BASE_URL = 'https://api.teraboxdownloader.co.in';

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
  if (!email) return null;
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/google-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, name, avatar, googleId }),
    });

    const data = await response.json();
    if (data.success && data.user) {
      if (data.token) {
        await AsyncStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      }
      await setStoredUser(data.user);
      return data.user;
    }
  } catch (e) {
    console.error('[AuthService] Google user sync failed:', e.message);
  }
  return null;
}

export async function fetchFreshUserStatus(email) {
  if (!email) return null;
  return await syncGoogleUser(email);
}

export async function logoutUser() {
  try {
    await AsyncStorage.removeItem(USER_STORAGE_KEY);
    await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (e) {}
}

export function checkIsPremium(user) {
  if (!user) return false;
  if (user.isPremium === true) return true;
  if (user.premiumStatus === 'premium') return true;
  if (user.plan && user.plan.toLowerCase() !== 'free') return true;
  return false;
}
