import React, { useCallback, useState, useEffect } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { AD_UNIT_IDS } from '../services/adConfig';
import Screen from '../components/Screen';
import { colors, radius, spacing } from '../theme';
import { getHistory, removeHistoryItem } from '../services/storage';
import { getStoredUser, checkIsPremium } from '../services/authService';
import {
  addDownloadListener,
  removeDownloadListener,
  pauseDownload,
  resumeDownload,
  cancelDownload,
} from '../services/downloadManager';

export default function DownloadScreen() {
  const [downloads, setDownloads] = useState([]);
  const [activeUpdates, setActiveUpdates] = useState({});
  const [bannerAdLoaded, setBannerAdLoaded] = useState(false);
  const [user, setUser] = useState(null);

  const isPremiumUser = checkIsPremium(user);

  useFocusEffect(
    useCallback(() => {
      loadDownloads();
    }, [])
  );

  async function loadDownloads() {
    const stored = await getStoredUser();
    setUser(stored || null);
    const list = await getHistory(stored?.email);

    // Perform file existence check
    const updatedList = await Promise.all(
      list.map(async (item) => {
        const safeName = item.name ? item.name.replace(/[^\w\-. ]/g, '_') : 'file';
        const fileUri = FileSystem.documentDirectory + safeName;
        let exists = false;
        try {
          const info = await FileSystem.getInfoAsync(fileUri);
          exists = info.exists;
        } catch (e) {
          // ignore
        }
        return { ...item, fileUri, exists };
      })
    );

    // Show ONLY items that are actively downloading/paused, marked as downloaded, or actually exist on disk
    const actualDownloads = updatedList.filter(
      (item) => item.exists || item.status === 'downloading' || item.status === 'paused' || item.status === 'downloaded'
    );

    setDownloads(actualDownloads);
  }

  // Subscribe/unsubscribe to real-time progress for all active downloads in the list
  useEffect(() => {
    const activeItems = downloads.filter(
      (item) => item.status === 'downloading' || item.status === 'paused'
    );

    const activeListeners = {};

    activeItems.forEach((item) => {
      const handleUpdate = (update) => {
        setActiveUpdates((prev) => ({
          ...prev,
          [item.id]: update,
        }));
        
        // If status changes to completed/failed/cancelled, reload list to update layout
        if (
          update.status === 'downloaded' ||
          update.status === 'failed' ||
          update.status === 'cancelled'
        ) {
          loadDownloads();
        }
      };

      addDownloadListener(item.id, handleUpdate);
      activeListeners[item.id] = handleUpdate;
    });

    return () => {
      Object.keys(activeListeners).forEach((id) => {
        removeDownloadListener(id, activeListeners[id]);
      });
    };
  }, [downloads]);

  async function handleShare(item) {
    if (!item.exists) {
      Alert.alert('File not found', 'The local file does not exist anymore.');
      return;
    }
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(item.fileUri);
    } else {
      Alert.alert('Sharing unavailable', 'Sharing is not supported on this device.');
    }
  }

  async function handleDelete(item) {
    Alert.alert(
      'Delete File',
      `Are you sure you want to delete "${item.name}"? This will delete the file from your device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (item.exists) {
                await FileSystem.deleteAsync(item.fileUri, { idempotent: true });
              }
              const newList = await removeHistoryItem(item.id);
              loadDownloads();
            } catch (e) {
              Alert.alert('Error', 'Failed to delete file.');
            }
          },
        },
      ]
    );
  }

  async function handleOpenFile(item) {
    if (!item.exists) {
      Alert.alert('File not found', 'The local file does not exist anymore.');
      return;
    }
    try {
      await Sharing.shareAsync(item.fileUri, {
        dialogTitle: `Open ${item.name}`,
        UTI: 'public.data',
      });
    } catch (e) {
      Alert.alert('Error', 'Failed to open file.');
    }
  }

  function renderItem({ item }) {
    const liveUpdate = activeUpdates[item.id] || {};
    const status = liveUpdate.status || item.status;
    const isDownloadingOrPaused = status === 'downloading' || status === 'paused';

    if (isDownloadingOrPaused) {
      const progress = liveUpdate.progress !== undefined ? liveUpdate.progress : (item.progress || 0);
      const isPaused = status === 'paused';
      const speed = liveUpdate.downloadSpeed || '0 KB/s';
      const timeRemaining = liveUpdate.timeRemaining || '--';
      const bytesWritten = liveUpdate.bytesWritten || '0 B';
      const totalBytes = liveUpdate.totalBytes || item.size || 'Unknown';

      return (
        <View style={styles.downloadCard}>
          <View style={styles.downloadHeader}>
            {item.thumbnail ? (
              <Image source={{ uri: item.thumbnail }} style={styles.thumbnailImage} />
            ) : (
              <View style={styles.iconWrap}>
                <Ionicons name="videocam" size={20} color="#6366F1" />
              </View>
            )}
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={2}>
                {item.name}
              </Text>
              <View style={styles.statusPillRow}>
                <View style={styles.statusPill}>
                  <Ionicons name="cloud-download-outline" size={10} color="#1E3A8A" />
                  <Text style={styles.statusPillText}>
                    {isPaused ? 'Paused' : 'Downloading'}
                  </Text>
                </View>
                <Text style={styles.totalSizeText}>{totalBytes}</Text>
              </View>
            </View>
          </View>

          <View style={styles.progressContainer}>
            {/* Speed and Time remaining badges */}
            <View style={styles.statsBadgesRow}>
              <View style={styles.statBadge}>
                <Ionicons name="speedometer-outline" size={12} color="#2563EB" />
                <Text style={styles.statBadgeText}>{speed}</Text>
              </View>
              <View style={styles.statBadge}>
                <Ionicons name="time-outline" size={12} color="#2563EB" />
                <Text style={styles.statBadgeText}>{timeRemaining}</Text>
              </View>
            </View>

            {/* Progress text */}
            <View style={styles.progressTextRow}>
              <Text style={styles.progressBytesText}>
                {bytesWritten} / {totalBytes}
              </Text>
              <Text style={styles.progressPercentText}>
                {Math.round(progress * 100)}%
              </Text>
            </View>

            {/* Progress bar */}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>

            {/* Controls */}
            <View style={styles.controlButtonsRow}>
              {isPaused ? (
                <TouchableOpacity
                  style={[styles.controlBtn, styles.pauseBtn]}
                  onPress={() => resumeDownload(item.id)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="play-outline" size={16} color="#2563EB" />
                  <Text style={styles.controlBtnTextBlue}>Resume</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.controlBtn, styles.pauseBtn]}
                  onPress={() => pauseDownload(item.id)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="pause-outline" size={16} color="#2563EB" />
                  <Text style={styles.controlBtnTextBlue}>Pause</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.controlBtn, styles.cancelBtn]}
                onPress={() => cancelDownload(item.id)}
                activeOpacity={0.8}
              >
                <Ionicons name="close-outline" size={16} color="#EF4444" />
                <Text style={styles.controlBtnTextRed}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    // Normal finished file item
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleOpenFile(item)}
        activeOpacity={0.8}
      >
        {item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={styles.thumbnailImageNormal} />
        ) : (
          <View style={styles.iconWrap}>
            <Ionicons name="videocam" size={24} color="#6366F1" />
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.size}>{item.size}</Text>
        </View>

        <View style={styles.actions}>
          {item.exists ? (
            <TouchableOpacity
              style={[styles.actionBtn, styles.shareBtn]}
              onPress={() => handleShare(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="share-social-outline" size={18} color="#4F46E5" />
            </TouchableOpacity>
          ) : (
            <View style={styles.cloudBadge}>
              <Ionicons name="cloud-done-outline" size={16} color="#10B981" />
            </View>
          )}

          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => handleDelete(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#E5F2FF', '#F1E5FF']}
        style={StyleSheet.absoluteFillObject}
      />
      <Screen style={styles.screenOverride}>
        <View style={styles.header}>
          <Text style={styles.title}>Downloads</Text>
          <Text style={styles.subtitle}>Manage your downloaded files and sharing</Text>
        </View>

        {downloads.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="cloud-download-outline" size={48} color="#A5B4FC" />
            </View>
            <Text style={styles.emptyTitle}>No downloads found</Text>
            <Text style={styles.emptyText}>
              Go to the Home tab and paste a link to start downloading!
            </Text>
          </View>
        ) : (
          <FlatList
            data={downloads}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
          />
        )}
      </Screen>

      {/* Banner Ad - Disabled for Premium Users */}
      {!isPremiumUser && (
        <View style={styles.bannerAdContainer}>
          <BannerAd
            unitId={AD_UNIT_IDS.BANNER}
            size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            onAdLoaded={() => setBannerAdLoaded(true)}
            onAdFailedToLoad={(error) => {
              console.log('Banner Ad failed to load:', error.message);
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenOverride: {
    backgroundColor: 'transparent',
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1E293B',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: 0,
    paddingBottom: spacing.xl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  downloadCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  downloadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  thumbnailImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: spacing.md,
    backgroundColor: '#F1F5F9',
  },
  thumbnailImageNormal: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: spacing.md,
    backgroundColor: '#F1F5F9',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  info: {
    flex: 1,
    marginRight: spacing.sm,
  },
  name: {
    color: '#1E293B',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  size: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  statusPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginRight: 8,
  },
  statusPillText: {
    color: '#2563EB',
    fontSize: 9,
    fontWeight: '700',
    marginLeft: 3,
  },
  totalSizeText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '500',
  },
  progressContainer: {
    marginTop: spacing.xs,
  },
  statsBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginRight: 6,
  },
  statBadgeText: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 3,
  },
  progressTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressBytesText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  progressPercentText: {
    fontSize: 10,
    color: '#2563EB',
    fontWeight: '700',
  },
  progressTrack: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: '#2563EB',
  },
  controlButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  controlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  pauseBtn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  cancelBtn: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FEE2E2',
    marginLeft: 6,
  },
  controlBtnTextBlue: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 3,
  },
  controlBtnTextRed: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 3,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  shareBtn: {
    backgroundColor: '#EEF2FF',
  },
  deleteBtn: {
    backgroundColor: '#FEE2E2',
  },
  cloudBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D1FAE5',
    marginLeft: 6,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: 64,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  bannerAdContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingVertical: 4,
  },
});
