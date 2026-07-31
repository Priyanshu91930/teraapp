import React, { useCallback, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Screen from '../components/Screen';
import { colors, radius, spacing } from '../theme';
import { getHistory, removeHistoryItem } from '../services/storage';

export default function DownloadScreen() {
  const [downloads, setDownloads] = useState([]);

  useFocusEffect(
    useCallback(() => {
      loadDownloads();
    }, [])
  );

  async function loadDownloads() {
    const list = await getHistory();
    // Check if the files actually exist on disk to show action buttons
    const updatedList = await Promise.all(
      list.map(async (item) => {
        const safeName = item.name.replace(/[^\w\-. ]/g, '_');
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
    setDownloads(updatedList);
  }

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
              // reload
              loadDownloads();
            } catch (e) {
              Alert.alert('Error', 'Failed to delete file.');
            }
          },
        },
      ]
    );
  }

  function renderItem({ item }) {
    return (
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="videocam" size={24} color="#6366F1" />
        </View>
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
      </View>
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
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
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
});
