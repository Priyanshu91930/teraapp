import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View, Platform } from 'react-native';
import Screen from '../components/Screen';
import Button from '../components/Button';
import { colors, radius, spacing } from '../theme';
import { getSettings, saveSettings, DEFAULT_SETTINGS } from '../services/storage';

function Section({ label, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function SettingRow({ icon, label, description, children }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {description ? <Text style={styles.rowDesc}>{description}</Text> : null}
      <View style={styles.rowControl}>{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  function update(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>

        <Section label="Downloads">
          <SettingRow
            icon="options"
            label="Quality"
            description="Preferred quality for resolved links."
          >
            <View style={styles.segment}>
              {['auto', 'hd', 'sd'].map((q) => (
                <View
                  key={q}
                  style={[
                    styles.segmentItem,
                    settings.downloadQuality === q && styles.segmentItemActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      settings.downloadQuality === q && styles.segmentTextActive,
                    ]}
                    onPress={() => update('downloadQuality', q)}
                  >
                    {q.toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
          </SettingRow>

          <SettingRow
            icon="images"
            label="Save to Gallery"
            description="Open the share sheet after download to save to gallery."
          >
            <Switch
              value={settings.saveToGallery}
              onValueChange={(v) => update('saveToGallery', v)}
              trackColor={{ true: colors.primary, false: colors.surface }}
              thumbColor={colors.white}
            />
          </SettingRow>

          <SettingRow
            icon="refresh"
            label="Auto-resume"
            description="Automatically resume interrupted downloads."
          >
            <Switch
              value={settings.autoResume}
              onValueChange={(v) => update('autoResume', v)}
              trackColor={{ true: colors.primary, false: colors.surface }}
              thumbColor={colors.white}
            />
          </SettingRow>
        </Section>

        <Button title={saved ? 'Saved ✓' : 'Save Settings'} onPress={handleSave} />

        <Text style={styles.footer}>
          TeraBox Downloader — Free & unlimited. Use responsibly.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    marginBottom: spacing.xs,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  sectionBody: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  row: {
    marginBottom: spacing.md,
  },
  rowLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  rowDesc: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  rowControl: {
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  segmentItemActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: colors.white,
  },
  footer: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
