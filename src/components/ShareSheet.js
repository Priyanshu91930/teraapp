import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Share,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SHARE_MSG = `🔥 Terabox Downloader App

✅ Download TeraBox files directly - no login needed
✅ Watch videos online for FREE - instant streaming
✅ Fast CDN download links - no ads, no waiting
✅ Supports all TeraBox mirrors & folders

📲 Download now (Free):
https://play.google.com/store/apps/details?id=com.anihub.teradownloader`;
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.anihub.teradownloader';

const shareOptions = [
  { id: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', color: '#25D366', bg: '#E8FAF0' },
  { id: 'telegram', label: 'Telegram', icon: 'paper-plane', color: '#0088CC', bg: '#E6F4FB' },
  { id: 'instagram', label: 'Instagram', icon: 'logo-instagram', color: '#E1306C', bg: '#FDE8F0' },
  { id: 'facebook', label: 'Facebook', icon: 'logo-facebook', color: '#1877F2', bg: '#E8F0FE' },
  { id: 'twitter', label: 'X / Twitter', icon: 'logo-twitter', color: '#000000', bg: '#F0F0F0' },
  { id: 'copy', label: 'Copy Link', icon: 'copy', color: '#6366F1', bg: '#EEF2FF' },
  { id: 'more', label: 'More', icon: 'ellipsis-horizontal', color: '#64748B', bg: '#F1F5F9' },
];

export default function ShareSheet({ visible, onClose }) {
  const insets = useSafeAreaInsets();

  function handleOption(option) {
    onClose();
    setTimeout(() => {
      switch (option.id) {
        case 'copy':
          Clipboard.setString(PLAY_URL);
          break;
        case 'whatsapp':
          Linking.openURL(`whatsapp://send?text=${encodeURIComponent(SHARE_MSG)}`).catch(() =>
            Linking.openURL(`https://wa.me/?text=${encodeURIComponent(SHARE_MSG)}`)
          );
          break;
        case 'telegram':
          Linking.openURL(`tg://msg?text=${encodeURIComponent(SHARE_MSG)}`).catch(() =>
            Linking.openURL(`https://t.me/share/url?url=${encodeURIComponent(PLAY_URL)}&text=${encodeURIComponent('🔥 Terabox Downloader - Download TeraBox files & watch videos FREE')}`)
          );
          break;
        case 'instagram':
          Share.share({ message: SHARE_MSG });
          break;
        case 'facebook':
          Linking.openURL(`fb://share/?link=${encodeURIComponent(PLAY_URL)}`).catch(() =>
            Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(PLAY_URL)}`)
          );
          break;
        case 'twitter':
          Linking.openURL(`twitter://post?message=${encodeURIComponent(SHARE_MSG)}`).catch(() =>
            Linking.openURL(`https://twitter.com/intent/tweet?text=${encodeURIComponent('Download fast terabox links + free watch videos without login')}&url=${encodeURIComponent(PLAY_URL)}`)
          );
          break;
        case 'more':
          Share.share({ message: SHARE_MSG });
          break;
      }
    }, 200);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Share App</Text>
          <Text style={styles.subtitle}>Invite your friends to try TeraBox Downloader</Text>

          <View style={styles.grid}>
            {shareOptions.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={styles.option}
                activeOpacity={0.7}
                onPress={() => handleOption(opt)}
              >
                <View style={[styles.iconWrap, { backgroundColor: opt.bg }]}>
                  <Ionicons name={opt.icon} size={24} color={opt.color} />
                </View>
                <Text style={styles.optionLabel}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  option: {
    width: '25%',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  optionLabel: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  cancelBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
  },
});
