import React, { useCallback, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  Platform,
  TouchableOpacity,
  Image,
  Alert
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Screen from '../components/Screen';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { colors, radius, spacing } from '../theme';
import { clearHistory, getHistory, removeHistoryItem } from '../services/storage';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { AD_UNIT_IDS } from '../services/adConfig';
import { getStoredUser, checkIsPremium } from '../services/authService';

function formatDate(iso) {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + 
           date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch (e) {
    return '';
  }
}

export default function HistoryScreen() {
  const [items, setItems] = useState([]);
  const [user, setUser] = useState(null);

  useFocusEffect(
    useCallback(() => {
      getHistory().then(setItems);
      getStoredUser().then((u) => {
        if (u) setUser(u);
      });
    }, [])
  );

  const isPremiumUser = checkIsPremium(user);

  async function handleRemove(id) {
    Alert.alert(
      'Remove from History',
      'Are you sure you want to remove this item from your download history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setItems(await removeHistoryItem(id));
          }
        }
      ]
    );
  }

  async function handleClear() {
    Alert.alert(
      'Clear History',
      'Are you sure you want to clear all download history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            setItems(await clearHistory());
          }
        }
      ]
    );
  }

  async function handleOpenFile(item) {
    const safeName = item.name.replace(/[^\w\-. ]/g, '_');
    const fileUri = FileSystem.documentDirectory + safeName;
    try {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (!info.exists) {
        Alert.alert('File not found', 'The local file does not exist anymore.');
        return;
      }
      await Sharing.shareAsync(fileUri, {
        dialogTitle: `Open ${item.name}`,
        UTI: 'public.data',
      });
    } catch (e) {
      Alert.alert('Error', 'Failed to open file.');
    }
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
            <Text style={styles.subtitle}>List of your past downloads</Text>
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
              Downloaded files and activities will show up here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => handleOpenFile(item)}
                activeOpacity={0.8}
              >
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
                  <View style={styles.metaRow}>
                    <Text style={styles.size}>{item.size}</Text>
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
            )}
          />
        )}
      </Screen>
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    marginBottom: spacing.sm,
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
  thumbnailImage: {
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  size: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  bullet: {
    color: '#94A3B8',
    fontSize: 10,
    marginHorizontal: 6,
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
});
