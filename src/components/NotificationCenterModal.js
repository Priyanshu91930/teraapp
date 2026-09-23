import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clearInAppNotifications } from '../services/notificationStorage';

function formatTimestamp(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (e) {
    return '';
  }
}

export default function NotificationCenterModal({
  visible,
  onClose,
  notifications = [],
  onClear,
}) {
  const handleItemPress = (item) => {
    const targetUrl = item.data?.url || item.url;
    if (targetUrl) {
      Linking.canOpenURL(targetUrl)
        .then((supported) => {
          if (supported) {
            Linking.openURL(targetUrl);
          } else {
            Alert.alert('Notification', item.body || item.title);
          }
        })
        .catch(() => {
          Alert.alert('Notification', item.body || item.title);
        });
    } else {
      Alert.alert(item.title || 'Notification', item.body || '');
    }
  };

  const handleClearAll = async () => {
    Alert.alert(
      'Clear Notifications',
      'Are you sure you want to delete all notification history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearInAppNotifications();
            if (onClear) onClear();
          },
        },
      ]
    );
  };

  const renderNotificationItem = ({ item }) => {
    const hasUrl = !!(item.data?.url || item.url);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => handleItemPress(item)}
      >
        <View style={styles.cardIconBox}>
          <Ionicons
            name={hasUrl ? 'link' : 'notifications'}
            size={18}
            color="#6366F1"
          />
        </View>

        <View style={styles.cardContent}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title || 'Notification'}
            </Text>
            <Text style={styles.cardTime}>{formatTimestamp(item.time)}</Text>
          </View>

          {!!item.body && (
            <Text style={styles.cardBody} numberOfLines={3}>
              {item.body}
            </Text>
          )}

          {hasUrl && (
            <View style={styles.urlBadge}>
              <Ionicons name="open-outline" size={12} color="#4F46E5" />
              <Text style={styles.urlBadgeText}>Tap to open link</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.bellIconBox}>
                <Ionicons name="notifications" size={18} color="#6366F1" />
              </View>
              <Text style={styles.headerTitle}>Notification Center</Text>
              {notifications.length > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{notifications.length}</Text>
                </View>
              )}
            </View>

            <View style={styles.headerActions}>
              {notifications.length > 0 && (
                <TouchableOpacity
                  style={styles.clearBtn}
                  onPress={handleClearAll}
                  activeOpacity={0.7}
                >
                  <Text style={styles.clearBtnText}>Clear All</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>

          {/* List or Empty State */}
          {notifications.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="notifications-off-outline" size={40} color="#94A3B8" />
              </View>
              <Text style={styles.emptyTitle}>No Notifications Yet</Text>
              <Text style={styles.emptySub}>
                Updates, announcements, and alert notifications will appear here.
              </Text>
            </View>
          ) : (
            <FlatList
              data={notifications}
              keyExtractor={(item, index) => item.id || String(index)}
              renderItem={renderNotificationItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '82%',
    minHeight: '45%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bellIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  countBadge: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 12,
  },
  cardIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  cardContent: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    marginRight: 8,
  },
  cardTime: {
    fontSize: 11,
    fontWeight: '500',
    color: '#94A3B8',
  },
  cardBody: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  urlBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  urlBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4F46E5',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 30,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
  },
});
