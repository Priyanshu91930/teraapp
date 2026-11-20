import React, { useCallback, useState, useEffect, useMemo } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import BannerAdView from '../components/BannerAdView';
import { AD_UNIT_IDS } from '../services/adConfig';
import { colors, radius, spacing } from '../theme';
import { getHistory, removeHistoryItem } from '../services/storage';
import { getStoredUser, checkIsPremium } from '../services/authService';
import PlayerScreen from './PlayerScreen';
import {
  addDownloadListener,
  removeDownloadListener,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  getDownloadMetadata,
} from '../services/downloadManager';

export default function DownloadScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [downloads, setDownloads] = useState([]);
  const [activeUpdates, setActiveUpdates] = useState({});


  const [user, setUser] = useState(null);

  // Video player modal state
  const [playerVisible, setPlayerVisible] = useState(false);
  const [playerSource, setPlayerSource] = useState(null);
  const [playerName, setPlayerName] = useState('');

  // Folder dropdown collapse state
  const [collapsedFolders, setCollapsedFolders] = useState({});

  const toggleFolderCollapse = (folderName) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderName]: !prev[folderName],
    }));
  };

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
    const downloadMeta = await getDownloadMetadata();

    const IGNORED_SYSTEM_FILES = new Set(['datastore', 'BridgelessReactNativeDevBundle.js', 'manifest.json', 'settings.json']);
    const SYSTEM_EXTENSIONS = ['.js', '.json', '.db', '.sqlite', '.tmp', '.part', '.log', '.dat', '.bundle'];
    const MEDIA_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.3gp', '.mp3', '.wav', '.jpg', '.jpeg', '.png', '.zip', '.rar', '.pdf', '.apk', '.m4v', '.ts', '.aac', '.m4a', '.srt', '.vtt', '.txt'];

    const cleanList = list.filter((item) => {
      if (!item.name) return false;
      if (IGNORED_SYSTEM_FILES.has(item.name)) return false;
      const lower = item.name.toLowerCase();
      if (SYSTEM_EXTENSIONS.some((ext) => lower.endsWith(ext))) return false;
      return true;
    });

    // Perform file existence check and attach stored download metadata (folderName, thumbnail)
    const updatedList = await Promise.all(
      cleanList.map(async (item) => {
        const safeName = item.name ? item.name.replace(/[^\w\-. ]/g, '_') : 'file';
        const fileUri = FileSystem.documentDirectory + safeName;
        let exists = false;
        try {
          const info = await FileSystem.getInfoAsync(fileUri);
          exists = info.exists;
        } catch (e) {
          // ignore
        }
        const meta = downloadMeta[item.name] || {};
        return {
          ...item,
          folderName: item.folderName || meta.folderName || '',
          thumbnail: item.thumbnail || meta.thumbnail || '',
          fileUri,
          exists,
        };
      })
    );

    // Scan disk for any orphaned files in DocumentDirectory that exist on disk but were missed in history
    try {
      const diskFiles = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory);
      const knownFileUris = new Set(updatedList.map((i) => i.fileUri));
      const historyByName = new Map(updatedList.map((i) => [i.name, i]));

      for (const fileName of diskFiles) {
        if (fileName.startsWith('.') || fileName.startsWith('RCT') || fileName.startsWith('Exponent')) continue;
        if (IGNORED_SYSTEM_FILES.has(fileName)) continue;

        const lowerName = fileName.toLowerCase();
        if (SYSTEM_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) continue;

        const hasMediaExt = MEDIA_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
        const matchingHist = historyByName.get(fileName);
        const meta = downloadMeta[fileName] || {};

        if (!hasMediaExt && !matchingHist && !meta.folderName) continue;

        const fileUri = FileSystem.documentDirectory + fileName;
        if (!knownFileUris.has(fileUri)) {
          let sizeStr = 'Unknown';
          try {
            const info = await FileSystem.getInfoAsync(fileUri);
            if (info.exists && info.size) {
              const k = 1024;
              const i = Math.floor(Math.log(info.size) / Math.log(k));
              const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
              sizeStr = parseFloat((info.size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            }
          } catch (e) {}

          updatedList.push({
            id: 'disk_' + fileName,
            name: fileName,
            size: meta.size || sizeStr,
            url: matchingHist?.url || meta.url || '',
            thumbnail: matchingHist?.thumbnail || meta.thumbnail || '',
            folderName: matchingHist?.folderName || meta.folderName || '',
            status: 'downloaded',
            progress: 1,
            downloadedAt: matchingHist?.downloadedAt || meta.downloadedAt || new Date().toISOString(),
            fileUri,
            exists: true,
          });
        }
      }
    } catch (diskErr) {
      console.log('Disk scan error:', diskErr.message);
    }

    // Show ONLY user media files that exist on disk, or are downloading/paused
    const actualDownloads = updatedList.filter((item) => {
      if (!item.exists && item.status !== 'downloading' && item.status !== 'paused') return false;
      if (IGNORED_SYSTEM_FILES.has(item.name)) return false;
      const lower = (item.name || '').toLowerCase();
      if (SYSTEM_EXTENSIONS.some((ext) => lower.endsWith(ext))) return false;
      return true;
    });

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

  // Group downloads by folderName for clean folder card display
  const groupedData = useMemo(() => {
    const groups = [];
    const folderMap = {};

    downloads.forEach((item) => {
      let fname = item.folderName ? item.folderName.trim() : '';
      if (fname) {
        if (!folderMap[fname]) {
          folderMap[fname] = {
            id: 'folder_' + fname,
            isFolderGroup: true,
            folderName: fname,
            items: [],
          };
          groups.push(folderMap[fname]);
        }
        folderMap[fname].items.push(item);
      } else {
        groups.push({
          id: item.id,
          isSingleItem: true,
          item: item,
        });
      }
    });

    return groups;
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
              await removeHistoryItem(item.id);
              loadDownloads();
            } catch (e) {
              Alert.alert('Error', 'Failed to delete file.');
            }
          },
        },
      ]
    );
  }

  // 1-Tap Play Handler for downloaded items
  async function handleOpenFile(item) {
    if (!item.exists) {
      Alert.alert('File not found', 'The local file does not exist on your device anymore.');
      return;
    }
    const isVideo = item.stream_url || (item.name && /\.(mp4|mkv|avi|mov|webm|flv|3gp|mp3|m4v)$/i.test(item.name));
    if (isVideo) {
      console.log('[DownloadScreen] 1-Tap Play triggered for video:', item.fileUri);
      setPlayerSource({ url: item.fileUri, headers: {} });
      setPlayerName(item.name || 'Video');
      setPlayerVisible(true);
    } else {
      try {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(item.fileUri, {
            dialogTitle: `Open ${item.name}`,
            UTI: 'public.data',
          });
        } else {
          Alert.alert('File Saved', `Saved to ${item.fileUri}`);
        }
      } catch (e) {
        Alert.alert('Error', 'Failed to open file.');
      }
    }
  }

  function renderSingleFileCard(item, isInsideFolder = false) {
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
        <View key={item.id} style={[styles.downloadCard, isInsideFolder && styles.innerFolderCard]}>
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

            <View style={styles.progressTextRow}>
              <Text style={styles.progressBytesText}>
                {bytesWritten} / {totalBytes}
              </Text>
              <Text style={styles.progressPercentText}>
                {Math.round(progress * 100)}%
              </Text>
            </View>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>

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

    // Normal finished file item — 1-tap play enabled!
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.card, isInsideFolder && styles.innerFolderCard]}
        onPress={() => handleOpenFile(item)}
        activeOpacity={0.8}
      >
        {item.thumbnail ? (
          <Image
            source={{
              uri: item.thumbnail,
              headers: item.downloadHeaders
                ? (typeof item.downloadHeaders === 'string'
                    ? JSON.parse(item.downloadHeaders)
                    : item.downloadHeaders)
                : {},
            }}
            style={styles.thumbnailImageNormal}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.iconWrap}>
            <Ionicons name="play-circle" size={24} color="#6366F1" />
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.size}>{item.size} • Tap to Play</Text>
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

  function renderGroupItem({ item: group }) {
    if (group.isFolderGroup) {
      const isCollapsed = Boolean(collapsedFolders[group.folderName]);
      return (
        <View style={styles.folderGroupCard}>
          <TouchableOpacity
            style={styles.folderGroupHeader}
            activeOpacity={0.7}
            onPress={() => toggleFolderCollapse(group.folderName)}
          >
            <View style={styles.folderIconBadge}>
              <Ionicons name="folder-open" size={20} color="#3B82F6" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.folderGroupTitle} numberOfLines={1}>
                {group.folderName}
              </Text>
              <Text style={styles.folderGroupSubtitle}>
                {group.items.length} file{group.items.length > 1 ? 's' : ''} ready in folder
              </Text>
            </View>
            <Ionicons
              name={isCollapsed ? 'chevron-down' : 'chevron-up'}
              size={22}
              color="#6B7280"
              style={{ marginLeft: 8 }}
            />
          </TouchableOpacity>

          {!isCollapsed && (
            <>
              <View style={styles.folderDivider} />
              <View style={styles.folderItemsContainer}>
                {group.items.map((fileItem) => renderSingleFileCard(fileItem, true))}
              </View>
            </>
          )}
        </View>
      );
    }

    return renderSingleFileCard(group.item, false);
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#E5F2FF', '#F1E5FF']}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Blue Top Header matching Settings */}
      <View style={[styles.blueHeader, { paddingTop: insets.top + 6, height: 60 + insets.top }]}>
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.headerCircleBtn}
            onPress={() => navigation?.navigate('Home')}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Downloads</Text>
          <View style={{ width: 38 }} />
        </View>
      </View>

      <View style={styles.contentWrap}>
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
            data={groupedData}
            keyExtractor={(group) => group.id}
            contentContainerStyle={styles.list}
            renderItem={renderGroupItem}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <PlayerScreen
        visible={playerVisible}
        url={playerSource?.url}
        fallbackUrl={playerSource?.fallbackUrl}
        headers={playerSource?.headers}
        name={playerName}
        onClose={() => setPlayerVisible(false)}
        isPremium={isPremiumUser}
      />

      {/* Banner Ad - Bottom Banner */}
      <BannerAdView
        unitId={AD_UNIT_IDS.BANNER_3}
        isPremium={isPremiumUser}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  blueHeader: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  contentWrap: {
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
    paddingTop: 14,
    paddingBottom: spacing.xl,
  },
  folderGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  folderGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  folderIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  folderGroupTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  folderGroupSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  folderDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 10,
  },
  folderItemsContainer: {
    marginTop: 2,
  },
  innerFolderCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 0,
    shadowOpacity: 0,
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
