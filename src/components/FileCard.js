import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme';

export default function FileCard({ name, size, status, thumbnail }) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        {thumbnail ? (
          <Text>{thumbnail}</Text>
        ) : (
          <Ionicons name="videocam" size={22} color={colors.primary} />
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.size}>{size}</Text>
      </View>
      {status ? (
        <Ionicons
          name={
            status === 'downloaded' ? 'checkmark-circle' : 'ellipsis-horizontal-circle'
          }
          size={20}
          color={status === 'downloaded' ? colors.accent : colors.textMuted}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  info: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  size: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
});
