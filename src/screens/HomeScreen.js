import React, { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { colors, radius, spacing } from '../theme';
import { extractTeraboxUrl, resolveTeraboxLink } from '../services/api';
import { addHistoryItem, getSettings } from '../services/storage';

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0 || !bytes || isNaN(bytes)) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState(null);
  const [input, setInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);

  // Advanced download stats & control
  const [downloadResumable, setDownloadResumable] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [downloadSpeed, setDownloadSpeed] = useState('0 KB/s');
  const [timeRemaining, setTimeRemaining] = useState('--');
  const [bytesWritten, setBytesWritten] = useState('0 MB');
  const [totalBytes, setTotalBytes] = useState('0 MB');
  const startTimeRef = useRef(0);

  useEffect(() => {
    loadSettings();
    const unsub = navigation.addListener('focus', loadSettings);
    return unsub;
  }, [navigation]);

  async function loadSettings() {
    const s = await getSettings();
    setSettings(s);
  }

  async function pasteFromClipboard() {
    const text = await Clipboard.getStringAsync();
    if (text) {
      setInput(text);
      setError('');
    }
  }

  function validate() {
    const url = extractTeraboxUrl(input);
    if (!url) {
      setError('Invalid share link. Please paste a valid TeraBox link.');
      return null;
    }
    setError('');
    return url;
  }

  async function handleResolve() {
    const url = validate();
    if (!url) return;

    setParsing(true);
    setResult(null);
    setError('');
    try {
      const s = settings || await getSettings();
      const data = await resolveTeraboxLink(s.apiBaseUrl, url, s.downloadQuality);
      if (!data.downloadUrl) {
        throw new Error('Could not find a download link for this file.');
      }
      setResult(data);
    } catch (e) {
      setError(e.message || 'Failed to resolve link. Please try again.');
    } finally {
      setParsing(false);
    }
  }

  async function handleDownloadFinished(uri) {
    setProgress(1);
    setDownloading(false);
    setDownloadResumable(null);
    setIsPaused(false);

    await addHistoryItem({
      name: result.name,
      size: result.size,
      url: result.downloadUrl,
      status: 'downloaded',
    });

    Alert.alert('Download Complete', 'File downloaded successfully.');

    const s = settings || await getSettings();
    if (s.saveToGallery && Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'video/mp4' });
    }
  }

  async function handleDownload() {
    if (!result || !result.downloadUrl || downloading) return;
    setDownloading(true);
    setIsPaused(false);
    setProgress(0);
    setDownloadSpeed('0 KB/s');
    setTimeRemaining('--');
    setBytesWritten('0 MB');
    setTotalBytes(result.size || 'Unknown');
    startTimeRef.current = Date.now();

    try {
      const safeName = result.name.replace(/[^\w\-. ]/g, '_');
      const fileUri = FileSystem.documentDirectory + safeName;

      const download = FileSystem.createDownloadResumable(
        result.downloadUrl,
        fileUri,
        {},
        (progressEvent) => {
          const written = progressEvent.totalBytesWritten;
          const total = progressEvent.totalBytesExpectedToWrite;
          setBytesWritten(formatBytes(written));
          setTotalBytes(formatBytes(total));

          if (total > 0) {
            const p = written / total;
            setProgress(p);

            // Speed & Time remaining calculations
            const now = Date.now();
            const elapsed = (now - startTimeRef.current) / 1000;
            if (elapsed > 0) {
              const speed = written / elapsed; // bytes/sec
              setDownloadSpeed(formatBytes(speed) + '/s');

              const remainingBytes = total - written;
              const remainingTime = speed > 0 ? remainingBytes / speed : 0;
              setTimeRemaining(remainingTime > 0 ? Math.round(remainingTime) + 's' : '--');
            }
          }
        }
      );

      setDownloadResumable(download);

      const res = await download.downloadAsync();
      if (res) {
        await handleDownloadFinished(res.uri);
      }
    } catch (e) {
      if (e.message && e.message.includes('paused')) {
        // do not display error on manual pause
        return;
      }
      setError('Download failed: ' + (e.message || 'Unknown error'));
      setDownloading(false);
      setDownloadResumable(null);
    }
  }

  async function handlePause() {
    if (!downloadResumable) return;
    try {
      await downloadResumable.pauseAsync();
      setIsPaused(true);
    } catch (e) {
      setError('Failed to pause download.');
    }
  }

  async function handleResume() {
    if (!downloadResumable) return;
    try {
      setIsPaused(false);
      // adjust startTimeRef based on progress to keep speed calculation somewhat sane
      startTimeRef.current = Date.now() - (progress * 10000); 
      const res = await downloadResumable.resumeAsync();
      if (res) {
        await handleDownloadFinished(res.uri);
      }
    } catch (e) {
      setError('Failed to resume download.');
    }
  }

  async function handleCancel() {
    if (!downloadResumable) return;
    try {
      await downloadResumable.pauseAsync(); // pauses the download, preventing it from finishing
      const safeName = result.name.replace(/[^\w\-. ]/g, '_');
      const fileUri = FileSystem.documentDirectory + safeName;
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    } catch (e) {
      // ignore
    }
    setDownloading(false);
    setIsPaused(false);
    setProgress(0);
    setDownloadResumable(null);
    setDownloadSpeed('0 KB/s');
    setTimeRemaining('--');
  }

  const canResolve = input.trim().length > 0;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#E5F2FF', '#F1E5FF']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Royal Blue Top Header Bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8, height: 62 + insets.top }]}>
        <TouchableOpacity activeOpacity={0.7} style={styles.headerIconBtn}>
          <View style={styles.customMenuIcon}>
            <View style={styles.menuBarLong} />
            <View style={styles.menuBarShort} />
            <View style={styles.menuBarLong} />
          </View>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Terabox Downloader</Text>
        <TouchableOpacity activeOpacity={0.7} style={styles.headerIconBtn}>
          <Ionicons name="share-social-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Glassmorphic main downloader card */}
          <View style={styles.mainCard}>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Paste a TeraBox, TikTok, Instagram..."
                placeholderTextColor="#7C8BA1"
                value={input}
                onChangeText={(val) => {
                  setInput(val);
                  if (error) setError('');
                }}
                multiline
                numberOfLines={2}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Social platform chips */}
            <View style={styles.chipsRow}>
              <View style={styles.chip}>
                <Ionicons name="cloud-outline" size={14} color="#0066FF" />
                <Text style={styles.chipText}>TeraBox</Text>
              </View>
              <View style={styles.chip}>
                <Ionicons name="logo-tiktok" size={14} color="#000000" />
                <Text style={styles.chipText}>TikTok</Text>
              </View>
              <View style={styles.chip}>
                <Ionicons name="logo-instagram" size={14} color="#E1306C" />
                <Text style={styles.chipText}>Instagram</Text>
              </View>
              <View style={styles.chip}>
                <Ionicons name="logo-facebook" size={14} color="#1877F2" />
                <Text style={styles.chipText}>Facebook</Text>
              </View>
            </View>

            {/* Instructions tip */}
            <View style={styles.tipRow}>
              <Ionicons name="bulb-outline" size={16} color="#6366F1" />
              <Text style={styles.tipText}>
                Paste any link above and tap Get Files to download instantly.
              </Text>
            </View>

            {/* Action buttons */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.pasteButton}
                onPress={pasteFromClipboard}
                activeOpacity={0.8}
              >
                <Ionicons name="clipboard-outline" size={18} color="#FFFFFF" />
                <Text style={styles.pasteButtonText}>Paste</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.getFilesButtonWrap, !canResolve && styles.disabledBtn]}
                onPress={handleResolve}
                disabled={!canResolve || parsing}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={canResolve ? ['#6366F1', '#4F46E5'] : ['#A5B4FC', '#818CF8']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.getFilesGradient}
                >
                  {parsing ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.getFilesText}>Get Files</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          {/* Error Message */}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Premium Resolved Result Card / Downloader Card matching mockup */}
          {result && !parsing ? (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                {result.thumbnail ? (
                  <Image source={{ uri: result.thumbnail }} style={styles.thumbnailImage} />
                ) : (
                  <View style={styles.resultIconWrap}>
                    <Ionicons name="videocam" size={24} color="#3B82F6" />
                  </View>
                )}
                <View style={styles.resultInfo}>
                  <Text style={styles.resultName} numberOfLines={2}>
                    {result.name}
                  </Text>
                  {downloading ? (
                    <View style={styles.statusPillRow}>
                      <View style={styles.statusPill}>
                        <Ionicons name="cloud-download-outline" size={12} color="#1E3A8A" />
                        <Text style={styles.statusPillText}>
                          {isPaused ? 'Paused' : 'Downloading'}
                        </Text>
                      </View>
                      <Text style={styles.totalSizeText}>{totalBytes}</Text>
                    </View>
                  ) : (
                    <Text style={styles.resultSize}>{result.size}</Text>
                  )}
                </View>
              </View>

              {downloading ? (
                <View style={styles.progressContainer}>
                  {/* Speed and Time remaining badges */}
                  <View style={styles.statsBadgesRow}>
                    <View style={styles.statBadge}>
                      <Ionicons name="speedometer-outline" size={14} color="#2563EB" />
                      <Text style={styles.statBadgeText}>{downloadSpeed}</Text>
                    </View>
                    <View style={styles.statBadge}>
                      <Ionicons name="time-outline" size={14} color="#2563EB" />
                      <Text style={styles.statBadgeText}>{timeRemaining}</Text>
                    </View>
                  </View>

                  {/* Progress numeric indicators */}
                  <View style={styles.progressTextRow}>
                    <Text style={styles.progressBytesText}>
                      {bytesWritten} / {totalBytes}
                    </Text>
                    <Text style={styles.progressPercentText}>
                      {Math.round(progress * 100)}%
                    </Text>
                  </View>

                  {/* Clean progress bar */}
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                  </View>

                  {/* Action controls: Pause/Resume and Cancel */}
                  <View style={styles.controlButtonsRow}>
                    {isPaused ? (
                      <TouchableOpacity
                        style={[styles.controlBtn, styles.pauseBtn]}
                        onPress={handleResume}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="play-outline" size={18} color="#2563EB" />
                        <Text style={styles.controlBtnTextBlue}>Resume</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.controlBtn, styles.pauseBtn]}
                        onPress={handlePause}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="pause-outline" size={18} color="#2563EB" />
                        <Text style={styles.controlBtnTextBlue}>Pause</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.controlBtn, styles.cancelBtn]}
                      onPress={handleCancel}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="close-outline" size={18} color="#EF4444" />
                      <Text style={styles.controlBtnTextRed}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.downloadBtn}
                  onPress={handleDownload}
                  activeOpacity={0.8}
                >
                  <Text style={styles.downloadBtnText}>Download File</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {/* Mock Advertisement Banner */}
          <View style={styles.adCard}>
            <View style={styles.adBadgeRow}>
              <View style={styles.adBadge}>
                <Text style={styles.adBadgeText}>Ad</Text>
              </View>
              <Text style={styles.adLabel}>Advertisement</Text>
            </View>
            <View style={styles.adContent}>
              <View style={styles.adMainRow}>
                <View style={styles.adLogo}>
                  <Ionicons name="logo-google" size={24} color="#4285F4" />
                </View>
                <View style={styles.adInfo}>
                  <Text style={styles.adTitle}>Test Ad : Google Ads</Text>
                  <Text style={styles.adSubtitleText}>
                    Stay up to date with your Ads Check how your ads are performing
                  </Text>
                </View>
              </View>
              <View style={styles.adImagePlaceholder}>
                <Ionicons name="image-outline" size={40} color="#9CA3AF" />
                <Text style={styles.adPlaceholderText}>Premium Sponsor Ad</Text>
              </View>
              <TouchableOpacity style={styles.adInstallBtn} activeOpacity={0.8}>
                <Text style={styles.adInstallText}>INSTALL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  flex: {
    flex: 1,
  },
  topBar: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  headerIconBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customMenuIcon: {
    width: 22,
    height: 14,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  menuBarLong: {
    width: 22,
    height: 2.5,
    backgroundColor: '#FFFFFF',
    borderRadius: 1.25,
  },
  menuBarShort: {
    width: 14,
    height: 2.5,
    backgroundColor: '#FFFFFF',
    borderRadius: 1.25,
  },
  topBarTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.2,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  mainCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 20,
    padding: spacing.md,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 15,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    marginBottom: spacing.md,
  },
  inputContainer: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  input: {
    fontSize: 14,
    color: '#1E293B',
    minHeight: 48,
    textAlignVertical: 'top',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(241, 245, 249, 0.9)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 6,
    marginBottom: 6,
  },
  chipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
    marginLeft: 4,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(238, 242, 255, 0.7)',
    borderRadius: 8,
    padding: 8,
    marginBottom: spacing.md,
  },
  tipText: {
    fontSize: 12,
    color: '#4F46E5',
    marginLeft: 6,
    flex: 1,
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 10,
  },
  pasteButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    marginLeft: 4,
  },
  getFilesButtonWrap: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  getFilesGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  getFilesText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    fontWeight: '500',
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  thumbnailImage: {
    width: 52,
    height: 52,
    borderRadius: 10,
    marginRight: spacing.md,
    backgroundColor: '#F1F5F9',
  },
  resultIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  resultSize: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
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
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 4,
  },
  totalSizeText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '500',
  },
  downloadBtn: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  downloadBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
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
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 8,
  },
  statBadgeText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  progressTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressBytesText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  progressPercentText: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 16,
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
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  pauseBtn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    marginRight: 8,
  },
  cancelBtn: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FEE2E2',
    marginLeft: 8,
  },
  controlBtnTextBlue: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  controlBtnTextRed: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  adCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  adBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  adBadge: {
    backgroundColor: '#F59E0B',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginRight: 6,
  },
  adBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  adLabel: {
    color: '#4B5563',
    fontSize: 12,
    fontWeight: '600',
  },
  adContent: {
    alignItems: 'center',
  },
  adMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  adLogo: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  adInfo: {
    flex: 1,
  },
  adTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  adSubtitleText: {
    color: '#4B5563',
    fontSize: 11,
    marginTop: 2,
  },
  adImagePlaceholder: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  adPlaceholderText: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
  },
  adInstallBtn: {
    width: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  adInstallText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
