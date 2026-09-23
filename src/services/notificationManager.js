import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // Show banner & sound for remote Firebase Push Notifications, silent for download progress
    const isRemote = notification && notification.request && notification.request.trigger && (
      notification.request.trigger.type === 'push' || notification.request.trigger.type === 'remote'
    );
    return {
      shouldShowBanner: isRemote,
      shouldShowList: true,
      shouldPlaySound: isRemote,
      shouldSetBadge: isRemote,
    };
  },
});

// Request notification permissions (Android 13+)
export async function requestNotificationPermission() {
  if (Platform.OS === 'android') {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  }
  return true;
}

// Set up Android notification channels (silent for downloads, default for alerts/push)
export async function setupNotificationChannel() {
  if (Platform.OS === 'android') {
    // 1. Silent channel for progress updates (no sound, no heads-up)
    await Notifications.setNotificationChannelAsync('downloads_silent', {
      name: 'Download Progress',
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      vibrationPattern: null,
      enableVibrate: false,
      showBadge: false,
    });

    // 2. Alerting channel for download finish/fail & push notifications
    await Notifications.setNotificationChannelAsync('downloads_alerts', {
      name: 'Notifications & Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
      showBadge: true,
    });
  }
}

// Register and initialize Firebase Remote Push Notifications
export async function setupFirebaseRemoteNotifications() {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;

    if (Platform.OS === 'android') {
      try {
        const token = await Notifications.getDevicePushTokenAsync();
        console.log('[Firebase FCM] Device FCM Push Token:', token?.data);
      } catch (tokenErr) {
        console.log('[Firebase FCM] Device token registration info:', tokenErr.message);
      }
    }

    // Auto-save incoming remote push notifications to local notification history
    Notifications.addNotificationReceivedListener((notification) => {
      try {
        const content = notification?.request?.content;
        if (content) {
          import('./notificationStorage').then(({ saveInAppNotification }) => {
            saveInAppNotification({
              title: content.title || 'New Notification',
              body: content.body || '',
              data: content.data || {},
            });
          });
        }
      } catch (e) {}
    });

    // Handle deep link / URL navigation when user taps a push notification
    Notifications.addNotificationResponseReceivedListener((response) => {
      try {
        const content = response?.notification?.request?.content;
        const data = content?.data;
        console.log('[Firebase FCM] Push Notification Tapped:', data);
        if (content) {
          import('./notificationStorage').then(({ saveInAppNotification }) => {
            saveInAppNotification({
              title: content.title || 'New Notification',
              body: content.body || '',
              data: content.data || {},
            });
          });
        }
        if (data && data.url) {
          import('expo-linking').then((Linking) => {
            Linking.openURL(data.url).catch(() => {});
          });
        }
      } catch (e) {
        console.log('[Firebase FCM] Tap listener error:', e.message);
      }
    });
  } catch (err) {
    console.log('[Firebase FCM] Push notification setup error:', err.message);
  }
}

const PROGRESS_COLOR = '#3B82F6';
const SUCCESS_COLOR = '#22C55E';
const ERROR_COLOR = '#EF4444';

// On Android the channel is selected through the trigger, not the content.
function channelTrigger(channelId) {
  if (Platform.OS === 'android') {
    return { channelId };
  }
  return null;
}

// Show a download progress notification
// Returns the notification identifier to update/cancel later
export async function showDownloadNotification(id, fileName, progress = 0) {
  const percent = Math.round(progress * 100);

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `download_${id}`,
      content: {
        title: 'Downloading...',
        body: `${fileName}\n${percent}%`,
        color: PROGRESS_COLOR,
        sticky: true,           // Cannot be dismissed by user while downloading
        priority: 'low',
      },
      trigger: channelTrigger('downloads_silent'), // Show immediately
    });
  } catch (e) {
    console.log('Notification error:', e);
  }
}

// Update the progress notification in place (same identifier => one card only)
export async function updateDownloadNotification(
  id,
  fileName,
  progress,
  bytesWritten = '',
  totalBytes = '',
  speed = '',
  timeRemaining = ''
) {
  const percent = Math.round(progress * 100);
  const downloaded = [bytesWritten, totalBytes].filter(Boolean).join(' / ');
  const detail = [downloaded, speed, timeRemaining ? `${timeRemaining} left` : '']
    .filter(Boolean)
    .join(' · ');

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `download_${id}`,
      content: {
        title: `Downloading ${percent}%`,
        body: `${fileName}\n${detail}`.trim(),
        color: PROGRESS_COLOR,
        sticky: true,
        priority: 'low',
      },
      trigger: channelTrigger('downloads_silent'),
    });
  } catch (e) {
    console.log('Notification update error:', e);
  }
}

// Show download complete notification
export async function showDownloadCompleteNotification(id, fileName) {
  try {
    // First, dismiss the ongoing silent progress notification
    await Notifications.dismissNotificationAsync(`download_${id}`);

    // Present the complete alert notification
    await Notifications.scheduleNotificationAsync({
      identifier: `download_${id}`,
      content: {
        title: 'Download Complete',
        body: fileName,
        color: SUCCESS_COLOR,
        priority: 'default',
      },
      trigger: channelTrigger('downloads_alerts'),
    });
  } catch (e) {
    console.log('Complete notification error:', e);
  }
}

// Show download failed notification
export async function showDownloadFailedNotification(id, fileName) {
  try {
    // First, dismiss the ongoing silent progress notification
    await Notifications.dismissNotificationAsync(`download_${id}`);

    // Present the failed alert notification
    await Notifications.scheduleNotificationAsync({
      identifier: `download_${id}`,
      content: {
        title: 'Download Failed',
        body: fileName,
        color: ERROR_COLOR,
        priority: 'default',
      },
      trigger: channelTrigger('downloads_alerts'),
    });
  } catch (e) {
    console.log('Failed notification error:', e);
  }
}

// Dismiss a notification (on pause/cancel)
export async function dismissDownloadNotification(id) {
  try {
    await Notifications.dismissNotificationAsync(`download_${id}`);
  } catch (e) {
    console.log('Dismiss notification error:', e);
  }
}
