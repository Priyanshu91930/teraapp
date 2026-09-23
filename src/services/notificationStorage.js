import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATIONS_STORAGE_KEY = '@teraapp/push_notifications_history';
const UNREAD_COUNT_KEY = '@teraapp/unread_notifications_count';

let notificationListeners = [];

export function subscribeNotificationUpdates(listener) {
  notificationListeners.push(listener);
  return () => {
    notificationListeners = notificationListeners.filter((l) => l !== listener);
  };
}

function notifyNotificationListeners() {
  notificationListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {}
  });
}

export async function getInAppNotifications() {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export async function saveInAppNotification({ title, body, data = {}, time = null }) {
  try {
    const current = await getInAppNotifications();
    const newItem = {
      id: String(Date.now() + Math.random()),
      title: title || 'Notification',
      body: body || '',
      data: data || {},
      time: time || new Date().toISOString(),
      read: false,
    };

    // Filter duplicate identical notifications within 5 seconds
    const isDuplicate = current.some(
      (n) => n.title === newItem.title && n.body === newItem.body && Math.abs(new Date(n.time) - new Date(newItem.time)) < 5000
    );

    if (isDuplicate) return current;

    const updated = [newItem, ...current].slice(0, 50);
    await AsyncStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));

    // Increment unread count
    const unread = await getUnreadNotificationCount();
    await AsyncStorage.setItem(UNREAD_COUNT_KEY, String(unread + 1));

    notifyNotificationListeners();
    return updated;
  } catch (e) {
    console.log('[NotificationStorage] Save error:', e.message);
    return [];
  }
}

export async function getUnreadNotificationCount() {
  try {
    const raw = await AsyncStorage.getItem(UNREAD_COUNT_KEY);
    if (raw !== null) return parseInt(raw, 10) || 0;
    const list = await getInAppNotifications();
    return list.filter((n) => !n.read).length;
  } catch (e) {
    return 0;
  }
}

export async function markNotificationsAsRead() {
  try {
    await AsyncStorage.setItem(UNREAD_COUNT_KEY, '0');
    const current = await getInAppNotifications();
    const updated = current.map((n) => ({ ...n, read: true }));
    await AsyncStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
    notifyNotificationListeners();
  } catch (e) {}
}

export async function clearInAppNotifications() {
  try {
    await AsyncStorage.removeItem(NOTIFICATIONS_STORAGE_KEY);
    await AsyncStorage.setItem(UNREAD_COUNT_KEY, '0');
    notifyNotificationListeners();
    return [];
  } catch (e) {
    return [];
  }
}
