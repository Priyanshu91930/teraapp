import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Screen from '../components/Screen';
import FileCard from '../components/FileCard';
import EmptyState from '../components/EmptyState';
import Button from '../components/Button';
import { colors, spacing } from '../theme';
import { clearHistory, getHistory, removeHistoryItem } from '../services/storage';

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch (e) {
    return '';
  }
}

export default function HistoryScreen() {
  const [items, setItems] = useState([]);

  useFocusEffect(
    useCallback(() => {
      getHistory().then(setItems);
    }, [])
  );

  async function handleRemove(id) {
    setItems(await removeHistoryItem(id));
  }

  async function handleClear() {
    setItems(await clearHistory());
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
        {items.length > 0 ? (
          <Button
            title="Clear All"
            variant="ghost"
            onPress={handleClear}
            style={styles.clearBtn}
          />
        ) : null}
      </View>

      {items.length === 0 ? (
        <EmptyState
          icon="time-outline"
          title="No downloads yet"
          message="Files you download will show up here."
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <FileCard name={item.name} size={item.size} status={item.status} />
              <Text style={styles.date}>{formatDate(item.downloadedAt)}</Text>
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
  },
  clearBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: 0,
  },
  row: {
    marginBottom: spacing.sm,
  },
  date: {
    color: colors.textMuted,
    fontSize: 11,
    marginLeft: spacing.md + 44,
    marginBottom: spacing.sm,
  },
});
