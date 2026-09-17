import React, { useCallback, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  Platform,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Screen from '../components/Screen';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { clearHistory, getHistory, removeHistoryItem, getSettings } from '../services/storage';
import { resolveTeraboxLink } from '../services/api';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { AD_UNIT_IDS } from '../services/adConfig';
import { getStoredUser, checkIsPremium } from '../services/authService';
import PlayerScreen from './PlayerScreen';

function formatDate(iso) {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + 
           date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch (e) {
    return '';
  }
}

export default function HistoryScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [user, setUser] = useState(null);
  const [resolvingId, setResolvingId] = useState(null);

  // In-app video player state for history items
  const [playerVisible, setPlayerVisible] = useState(false);
  const [playerSource, setPlayerSource] = useState(null);
  const [playerName, setPlayerName] = useState(null);

  useFocusEffect(
    useCallback(() => {
      getStoredUser().then((u) => {
        setUser(u);
        getHistory(u?.email).then(setItems);
      });
    }, [])
  );

  const isPremiumUser = checkIsPremium(user);

  async function handleRemove(id) {
    Alert.alert(
      'Remove from History',
      'Are you sure you want to remove this item from history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setItems(await removeHistoryItem(id, user?.email));
          }
        }
      ]
    );
  }

  async function handleClear() {
    Alert.alert(
      'Clear History',
      'Are you sure you want to clear all history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            setItems(await clearHistory(user?.email));
          }
        }
      ]
    );
  }

  async function handleItemPress(item) {
    const safeName = item.name ? item.name.replace(/[^\w\-. ]/g, '_') : 'file';
    const fileUri = FileSystem.documentDirectory + safeName;

    // Check if local file exists
    try {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists) {
        await Sharing.shareAsync(fileUri, {
          dialogTitle: `Open ${item.name}`,
          UTI: 'public.data',
        });
        return;
      }
    } catch (e) {
      // ignore
    }

    // Resolve TeraBox link dynamically on-the-fly (since dlink is not stored in DB)
    if (item.url && item.url.startsWith('http')) {
      setResolvingId(item.id);
      try {
        const s = await getSettings();
        const data = await resolveTeraboxLink(s.apiBaseUrl, item.url, s.downloadQuality, s.useProxy);
        const resObj = (data.list && data.list.length > 0) ? data.list[0] : data;
        const playUrl = resObj.stream_url || resObj.dlink || resObj.downloadUrl || data.downloadUrl || '';

        if (playUrl) {
          setPlayerSource({ url: playUrl, headers: resObj.downloadHeaders || {} });
          setPlayerName(item.name || 'Video');
          setPlayerVisible(true);
        } else {
          Alert.alert('Error', 'Could not stream video from this link.');
        }
      } catch (err) {
        Alert.alert('Error', err.message || 'Failed to resolve link stream.');
      } finally {
        setResolvingId(null);
      }
      return;
    }

    Alert.alert(
      item.name || 'History Item',
      `Size: ${item.size || 'Unknown'}\nDate: ${formatDate(item.downloadedAt)}`,
      [{ text: 'OK' }]
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
          <View style={styles.headerTextGroup}>
            <Text style={styles.title}>History</Text>
            <Text style={styles.subtitle}>
              {user ? `Cloud Synced (${user.email})` : 'Your searched links & downloaded files'}
            </Text>
          </View>
          {items.length > 0 ? (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={handleClear}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-bin-outline" size={16} color="#EF4444" />
              <Text style={styles.clearBtnText}>Clear All</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="time-outline" size={48} color="#A5B4FC" />
            </View>
            <Text style={styles.emptyTitle}>No history found</Text>
            <Text style={styles.emptyText}>
              Searched TeraBox links will automatically sync with MongoDB and show up here with thumbnails.
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isResolving = resolvingId === item.id;
              return (
                <TouchableOpacity
                  style={styles.card}
                  onPress={() => handleItemPress(item)}
                  disabled={isResolving}
                  activeOpacity={0.8}
                >
                  {item.thumbnail ? (
                    <View style={styles.thumbnailWrap}>
                      <Image
                        source={{ uri: item.thumbnail }}
                        style={styles.thumbnailImage}
                        resizeMode="cover"
                      />
                      <View style={styles.playOverlayIcon}>
                        {isResolving ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Ionicons name="play" size={12} color="#FFFFFF" />
                        )}
                      </View>
                    </View>
                  ) : (
                    <View style={styles.iconWrap}>
                      {isResolving ? (
                        <ActivityIndicator size="small" color="#6366F1" />
                      ) : (
                        <Ionicons name="film-outline" size={22} color="#6366F1" />
                      )}
                    </View>
                  )}

                  <View style={styles.info}>
                    <Text style={styles.name} numberOfLines={2}>
                      {item.name || 'TeraBox File'}
                    </Text>
                    <View style={styles.metaRow}>
                      <View style={styles.statusBadge}>
                        <Text style={styles.statusBadgeText}>
                          {item.status === 'downloaded' ? 'Downloaded' : 'Cloud History'}
                        </Text>
                      </View>
                      <Text style={styles.size}>{item.size || 'Unknown'}</Text>
                      <Text style={styles.bullet}>•</Text>
                      <Text style={styles.date}>{formatDate(item.downloadedAt)}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleRemove(item.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </Screen>

      <PlayerScreen
        visible={playerVisible}
        url={playerSource?.url}
        headers={playerSource?.headers}
        name={playerName}
        onClose={() => setPlayerVisible(false)}
        isPremium={isPremiumUser}
      />

      {!isPremiumUser && (
        <View style={styles.bannerContainer}>
          <BannerAd
            unitId={AD_UNIT_IDS.BANNER}
            size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
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
  bannerContainer: {
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  screenOverride: {
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    marginBottom: 8,
  },
  headerTextGroup: {
    flex: 1,
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
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
    borderColor: '#FEE2E2',
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  clearBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  thumbnailWrap: {
    position: 'relative',
    marginRight: 12,
  },
  thumbnailImage: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  playOverlayIcon: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  statusBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
  },
  size: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  bullet: {
    color: '#94A3B8',
    fontSize: 10,
    marginHorizontal: 4,
  },
  date: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '500',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF5F5',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 64,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
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
});
