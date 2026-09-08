import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View, Platform, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Screen from '../components/Screen';
import Button from '../components/Button';
import { colors, radius, spacing } from '../theme';
import { getSettings, saveSettings, DEFAULT_SETTINGS } from '../services/storage';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { AD_UNIT_IDS } from '../services/adConfig';

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

          <SettingRow
            icon="swap-horizontal"
            label="Proxy downloads"
            description="Route downloads through the server to bypass ISP/DNS blocks."
          >
            <Switch
              value={settings.useProxy}
              onValueChange={(v) => update('useProxy', v)}
              trackColor={{ true: colors.primary, false: colors.surface }}
              thumbColor={colors.white}
            />
          </SettingRow>
        </Section>

        <Button title={saved ? 'Saved ✓' : 'Save Settings'} onPress={handleSave} />

        <Text style={styles.footer}>
          Tera Downloader — Free & unlimited. Use responsibly.
        </Text>
      </ScrollView>
      <View style={styles.bannerContainer}>
        <BannerAd
          unitId={AD_UNIT_IDS.BANNER}
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    marginBottom: spacing.xs,
  },
  bannerContainer: {
    alignItems: 'center',
    backgroundColor: '#fff',
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
  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: spacing.sm,
  },
  statsLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1.2,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  updatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 4,
  },
  updatedText: {
    fontSize: 10,
    color: '#047857',
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    width: '48.5%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  barIndicator: {
    position: 'absolute',
    top: 14,
    right: 12,
    width: 28,
    height: 4,
    borderRadius: 2,
  },
  statNum: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  statBoxLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 4,
    letterSpacing: 0.5,
  },
});
