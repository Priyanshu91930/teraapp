import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as RNIap from 'react-native-iap';

const API_BASE_URL = 'https://teraapi-six.vercel.app';

function withTimeout(promise, timeoutMs = 5000, fallbackVal = null) {
  return Promise.race([
    promise,
    new Promise((resolve) =>
      setTimeout(() => {
        console.log(`[IAP Debug] Timed out after ${timeoutMs}ms`);
        resolve(fallbackVal);
      }, timeoutMs)
    ),
  ]);
}

export default function SubscriptionModal({ visible, onClose, user, onPaymentSuccess }) {
  const [selectedPlan, setSelectedPlan] = useState('monthly'); // 'weekly', 'monthly', 'yearly'
  const [loading, setLoading] = useState(false);
  const [subscriptionsList, setSubscriptionsList] = useState([]);

  const plans = [
    {
      id: 'weekly',
      sku: 'weekly_pass',
      name: 'Weekly Pass',
      price: '₹49',
      duration: '7 Days Access',
      badge: null,
      desc: 'Ideal for short-term fast downloads',
    },
    {
      id: 'monthly',
      sku: 'monthly_pro',
      name: 'Monthly Pro',
      price: '₹99',
      duration: '30 Days Access',
      badge: 'MOST POPULAR',
      desc: 'Unlimited speed + App, Web & Bot Access',
    },
    {
      id: 'yearly',
      sku: 'yearly_vip',
      name: 'Yearly VIP',
      price: '₹499',
      duration: '365 Days Access',
      badge: 'SAVE 75%',
      desc: 'Best value for frequent downloaders',
    },
  ];

  useEffect(() => {
    let purchaseUpdateSubscription;
    let purchaseErrorSubscription;

    const initIAP = async () => {
      try {
        console.log('[IAP Debug] Initializing Google Play Billing Connection...');
        const connected = await withTimeout(RNIap.initConnection(), 4000, false).catch((e) => {
          console.log('[IAP Debug] initConnection error:', e.message);
          return false;
        });

        if (connected === true) {
          const skus = ['weekly_pass', 'monthly_pro', 'yearly_vip'];
          const fetchedSubs = await withTimeout(RNIap.getSubscriptions({ skus }), 4000, []).catch((err) => {
            console.log('[IAP Debug] getSubscriptions catch:', err.message);
            return [];
          });

          console.log('[IAP Debug] Initial getSubscriptions count:', fetchedSubs?.length || 0);
          if (Array.isArray(fetchedSubs) && fetchedSubs.length > 0) {
            setSubscriptionsList(fetchedSubs);
          }
        }

        if (Platform.OS === 'android') {
          await RNIap.flushFailedPurchasesCachedAsPendingAndroid().catch(() => {});
        }

        purchaseUpdateSubscription = RNIap.purchaseUpdatedListener(async (purchase) => {
          console.log('[IAP Debug] purchaseUpdatedListener triggered for productId:', purchase.productId);
          const receipt = purchase.transactionReceipt || purchase.purchaseToken;
          if (receipt) {
            await verifyAndActivatePurchase(receipt, purchase.productId);
            await RNIap.finishTransaction({ purchase, isConsumable: false }).catch(() => {});
          }
        });

        purchaseErrorSubscription = RNIap.purchaseErrorListener((error) => {
          setLoading(false);
          if (error.code !== 'E_USER_CANCELLED') {
            console.warn('[IAP Debug] Purchase Error Event:', error);
          }
        });
      } catch (err) {
        console.log('[IAP Debug] initIAP Exception:', err.message);
      }
    };

    if (visible) {
      initIAP();
    }

    return () => {
      if (purchaseUpdateSubscription) purchaseUpdateSubscription.remove();
      if (purchaseErrorSubscription) purchaseErrorSubscription.remove();
      RNIap.endConnection().catch(() => {});
    };
  }, [visible]);

  async function verifyAndActivatePurchase(purchaseToken, productId) {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/payment/verify-play-purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user?.email,
          purchaseToken: purchaseToken || `test_token_${Date.now()}`,
          productId: productId || selectedPlan,
          plan: selectedPlan,
        }),
      });
      const data = await res.json();
      setLoading(false);

      if (data && data.success) {
        Alert.alert(
          '🎉 VIP Premium Activated!',
          `Thank you for upgrading! Your ${selectedPlan.toUpperCase()} plan is now active on Mobile App, Web & Telegram Bot.`
        );
        if (onPaymentSuccess) onPaymentSuccess(user?.email);
        if (onClose) onClose();
      } else {
        Alert.alert('Activation Error', data?.error || 'Failed to activate plan on server.');
      }
    } catch (e) {
      setLoading(false);
      Alert.alert('Activation Error', 'Network error during plan activation.');
    }
  }

  async function handleBuyNow() {
    if (!user || !user.email) {
      Alert.alert(
        '🔐 Sign In Required',
        'Please sign in with your Google Account first so your VIP plan can be linked to your email across App, Web & Telegram.',
        [{ text: 'OK' }]
      );
      return;
    }

    const currentPlan = plans.find((p) => p.id === selectedPlan);
    const sku = currentPlan?.sku || 'monthly_pro';
    console.log('[IAP Debug] Pay Button Pressed -> Selected Plan:', selectedPlan, 'Target SKU:', sku);

    setLoading(true);

    try {
      const connected = await withTimeout(RNIap.initConnection(), 4000, false).catch(() => false);

      if (Platform.OS === 'android') {
        const skus = ['weekly_pass', 'monthly_pro', 'yearly_vip'];
        let fetchedSubs = [];
        if (connected === true) {
          fetchedSubs = await withTimeout(RNIap.getSubscriptions({ skus }), 4000, []).catch((e) => {
            console.log('[IAP Step 2 getSubscriptions Error]:', e.message);
            return [];
          });
        }

        console.log('[IAP Step 3] getSubscriptions count:', fetchedSubs ? fetchedSubs.length : 0);

        const allSubs = [...(fetchedSubs || []), ...subscriptionsList];
        const subItem = allSubs.find((s) => s.productId === sku || s.sku === sku);
        const offerToken =
          subItem?.subscriptionOfferDetails?.[0]?.offerToken ||
          subItem?.subscriptionOfferDetailsAndroid?.[0]?.offerToken ||
          (subItem?.subscriptionOfferDetails && subItem.subscriptionOfferDetails[0] ? subItem.subscriptionOfferDetails[0].offerToken : null);

        console.log('[IAP Step 4] Found subItem:', !!subItem, 'offerToken:', offerToken || 'NONE');

        if (offerToken) {
          console.log('[IAP Step 5] Launching Google Play Billing Sheet with offerToken for SKU:', sku);
          await RNIap.requestSubscription({
            sku: sku,
            subscriptionOffers: [{ sku: sku, offerToken: offerToken }],
          });
        } else if (__DEV__) {
          Alert.alert(
            'Google Play Store Billing',
            `Play Store SKUs (weekly_pass, monthly_pro, yearly_vip) are active!\n\nNote: On local debug builds (npx expo run:android), Google Play restricts IPC billing.\n\nTo test real Google Play payments on device, install the build from Play Store (Internal Testing or Production track).`
          );
        } else {
          console.log('[IAP Step 5 Production] Attempting subscription launch for SKU:', sku);
          await RNIap.requestSubscription({
            sku: sku,
            subscriptionOffers: [{ sku: sku, offerToken: '' }],
          }).catch(async (subErr) => {
            console.log('[IAP Step 5 Error]:', subErr.message);
            Alert.alert('Google Play Billing', 'Unable to launch Google Play payment sheet. Please verify Play Store connection.');
          });
        }
      } else {
        await RNIap.requestPurchase({ skus: [sku] });
      }
    } catch (err) {
      console.log('[IAP Step Exception]', err.message || err);
      if (err.code !== 'E_USER_CANCELLED') {
        Alert.alert('Google Play Billing', err.message || 'Payment cancelled or unavailable.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="sparkles" size={22} color="#F59E0B" />
              <Text style={styles.headerTitle}>Upgrade to VIP Premium</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            {/* Features */}
            <View style={styles.featuresCard}>
              <Text style={styles.featuresHeading}>✨ What You Get with Premium:</Text>

              <View style={styles.featureItem}>
                <Ionicons name="folder-open" size={18} color="#6366F1" />
                <Text style={styles.featureText}>TeraBox Folder Download Support</Text>
              </View>

              <View style={styles.featureItem}>
                <Ionicons name="paper-plane" size={18} color="#0EA5E9" />
                <Text style={styles.featureText}>Direct File Delivery in Telegram Bot</Text>
              </View>

              <View style={styles.featureItem}>
                <Ionicons name="flash" size={18} color="#10B981" />
                <Text style={styles.featureText}>10x Ultra-Fast Download Speed</Text>
              </View>

              <View style={styles.featureItem}>
                <Ionicons name="hardware-chip-outline" size={18} color="#F59E0B" />
                <Text style={styles.featureText}>1 Subscription = 3 Memberships (App, Web & Telegram)</Text>
              </View>

              <View style={styles.featureItem}>
                <Ionicons name="ban-outline" size={18} color="#EF4444" />
                <Text style={styles.featureText}>100% Ad-Free Experience in App & Web</Text>
              </View>

              <View style={styles.featureItem}>
                <Ionicons name="film-outline" size={18} color="#8B5CF6" />
                <Text style={styles.featureText}>1080p Full HD Video Streaming & Player</Text>
              </View>
            </View>

            {/* Plans List */}
            <Text style={styles.selectPlanLabel}>Select Plan:</Text>
            {plans.map((item) => {
              const isSelected = selectedPlan === item.id;
              const subItem = subscriptionsList.find((s) => s.productId === item.sku || s.sku === item.sku);
              const playStorePrice = subItem?.subscriptionOfferDetails?.[0]?.pricingPhases?.pricingPhaseList?.[0]?.formattedPrice || subItem?.localizedPrice;
              const displayPrice = playStorePrice || item.price;
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.8}
                  style={[styles.planCard, isSelected && styles.planCardSelected]}
                  onPress={() => setSelectedPlan(item.id)}
                >
                  {item.badge && (
                    <View style={[styles.badge, item.id === 'yearly' ? styles.badgeGreen : styles.badgeGold]}>
                      <Text style={styles.badgeText}>{item.badge}</Text>
                    </View>
                  )}
                  <View style={styles.planRadioRow}>
                    <Ionicons
                      name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={isSelected ? '#2563EB' : '#94A3B8'}
                    />
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text style={styles.planName}>{item.name}</Text>
                      <Text style={styles.planDesc}>{item.desc}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.planPrice}>{displayPrice}</Text>
                      <Text style={styles.planDuration}>{item.duration}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Pay Button */}
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.payBtn}
              onPress={handleBuyNow}
              disabled={loading}
            >
              <LinearGradient
                colors={['#2563EB', '#4F46E5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.payGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <View style={styles.payBtnContent}>
                    <Ionicons name="shield-checkmark" size={20} color="#FFFFFF" />
                    <Text style={styles.payBtnText}>Pay Securely & Unlock Premium</Text>
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
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
    maxHeight: '88%',
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
    gap: 8,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  featuresCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  featuresHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 10,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 4,
  },
  featureText: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '600',
  },
  selectPlanLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 10,
  },
  planCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    position: 'relative',
  },
  planCardSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  badge: {
    position: 'absolute',
    top: -10,
    right: 16,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeGold: {
    backgroundColor: '#F59E0B',
  },
  badgeGreen: {
    backgroundColor: '#10B981',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  planRadioRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  planName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  planDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  planPrice: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2563EB',
  },
  planDuration: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  payBtn: {
    marginTop: 10,
    borderRadius: 16,
    overflow: 'hidden',
  },
  payGradient: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  payBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
