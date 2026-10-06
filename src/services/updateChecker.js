import SpInAppUpdates, { IAUUpdateKind } from 'sp-react-native-in-app-updates';
import { Platform } from 'react-native';

export const checkForAppUpdates = async () => {
  if (Platform.OS !== 'android') return;

  try {
    const inAppUpdates = new SpInAppUpdates(
      false // debug set to false in production
    );

    const result = await inAppUpdates.checkNeedsUpdate();

    if (result && result.shouldUpdate) {
      console.log('[InAppUpdates] Update available! Launching Immediate Update UI...');

      await inAppUpdates.startUpdate({
        updateType: IAUUpdateKind.IMMEDIATE, // Immediate Force Update
      });
    } else {
      console.log('[InAppUpdates] App is already on the latest version.');
    }
  } catch (error) {
    console.log('[InAppUpdates] Error checking for app updates:', error?.message || error);
  }
};
