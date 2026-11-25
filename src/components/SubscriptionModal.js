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
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  initConnection,
  fetchProducts,
  requestPurchase,
  finishTransaction,
  getAvailablePurchases,
  flushFailedPurchasesCachedAsPendingAndroid,
  purchaseUpdatedListener,
  purchaseErrorListener,
} from 'expo-iap';

const API_BASE_URL = 'https://teraapi-six.vercel.app';
const SKUS = ['week_pass', 'month_pro', 'year_vip', 'weekly_pass', 'monthly_pro', 'yearly_vip'];

export default function SubscriptionModal({ visible, onClose, user, onPaymentSuccess }) {
  const [selectedPlan, setSelectedPlan] = useState('monthly'); // 'weekly', 'monthly', 'yearly'
  const [loading, setLoading] = useState(false);
  const [subscriptionsList, setSubscriptionsList] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  const plans = [
    {
      id: 'weekly',
      sku: 'week_pass',
      altSku: 'weekly_pass',
      name: 'Weekly Pass',
      duration: 'Auto-renews weekly',
      badge: null,
      desc: 'UPI AutoPay & Cards • Cancel anytime',
      heading: '✨ What You Get with Premium (Weekly):',
      features: [
        { icon: 'time-outline', color: '#6366F1', text: '7 Days Unlimited VIP Access' },
        { icon: 'folder-open', color: '#6366F1', text: 'TeraBox Folder Download Support' },
        { icon: 'paper-plane', color: '#0EA5E9', text: 'Direct File Delivery in Telegram Bot' },
        { icon: 'flash', color: '#10B981', text: '10x Ultra-Fast Download Speed' },
        { icon: 'ban-outline', color: '#EF4444', text: '100% Ad-Free Experience in App & Web' },
        { icon: 'film-outline', color: '#8B5CF6', text: '1080p Full HD Video Streaming & Player' },
      ],
    },
    {
      id: 'monthly',
      sku: 'month_pro',
      altSku: 'monthly_pro',
      name: 'Monthly Pro',
      duration: 'Auto-renews monthly',
      badge: 'MOST POPULAR',
      desc: 'UPI AutoPay & Cards • Cancel anytime',
      heading: '✨ What You Get with Premium (Monthly):',
      features: [
        { icon: 'calendar-outline', color: '#F59E0B', text: '30 Days Full Access on App, Web & Bot' },
        { icon: 'folder-open', color: '#6366F1', text: 'TeraBox Folder Download Support' },
        { icon: 'paper-plane', color: '#0EA5E9', text: 'Direct File Delivery in Telegram Bot' },
        { icon: 'flash', color: '#10B981', text: '10x Ultra-Fast Download Speed' },
        { icon: 'ban-outline', color: '#EF4444', text: '100% Ad-Free Experience in App & Web' },
        { icon: 'film-outline', color: '#8B5CF6', text: '1080p Full HD Video Streaming & Player' },
      ],
    },
    {
      id: 'yearly',
      sku: 'year_vip',
      altSku: 'yearly_vip',
      name: 'Yearly VIP',
      duration: 'Auto-renews yearly',
      badge: 'SAVE 75%',
      desc: 'UPI AutoPay & Cards • Cancel anytime',
      heading: '✨ What You Get with Premium (Yearly):',
      features: [
        { icon: 'diamond-outline', color: '#10B981', text: '365 Days Uninterrupted VIP Membership' },
        { icon: 'pricetag-outline', color: '#10B981', text: 'Save Over 75% Compared to Monthly' },
        { icon: 'folder-open', color: '#6366F1', text: 'Unlimited TeraBox Folder Downloads' },
        { icon: 'paper-plane', color: '#0EA5E9', text: 'Dedicated Telegram Bot Bandwidth' },
        { icon: 'flash', color: '#10B981', text: 'Top Priority High-Speed Server CDN' },
        { icon: 'ban-outline', color: '#EF4444', text: '100% Ad-Free Everywhere + All Devices' },
      ],
    },
  ];

  useEffect(() => {
    let updateSub;
    let errorSub;
    let isMounted = true;

    async function initIAP() {
      if (!visible) return;

      try {
        console.log('[IAP Init] Setting up purchase listeners...');
        updateSub = purchaseUpdatedListener(async (purchase) => {
          console.log('[IAP Event] Purchase updated:', JSON.stringify(purchase));
          const receipt = purchase?.transactionReceipt || purchase?.purchaseToken;
          if (receipt) {
            await verifyAndActivatePurchase(receipt, purchase.productId);

            // Determine if subscription or one-time in-app product
            const storeProd = (subscriptionsList || []).find(
              (p) => p && (p.id === purchase.productId || p.productId === purchase.productId || p.sku === purchase.productId)
            );
            const isSub = purchase?.type === 'subs' || storeProd?.type === 'subs';

            // IMPORTANT: Subscriptions must NOT be consumed (isConsumable: false) so Google Play AutoPay continues recurring!
            // In-app one-time products are consumed (isConsumable: true) so user can repurchase upon expiration.
            try {
              await finishTransaction({ purchase, isConsumable: !isSub });
              console.log(`[IAP finishTransaction] Successfully acknowledged with isConsumable=${!isSub}`);
            } catch (finishErr) {
              console.log('[IAP finishTransaction primary warning, trying fallback]:', finishErr?.message);
              await finishTransaction({ purchase, isConsumable: !!isSub }).catch(() => {});
            }
          }
        });

        errorSub = purchaseErrorListener((error) => {
          console.log('[IAP Event Error]:', JSON.stringify(error));
          setLoading(false);
        });

        console.log('[IAP Init] Initializing Play Store Connection...');
        const result = await initConnection().catch((err) => {
          console.log('[IAP Init Warning] initConnection failed:', err?.message || err);
          return false;
        });

        if (isMounted) {
          setIsConnected(!!result);
        }

        if (result && isMounted) {
          // Clear any stuck unconsumed one-time purchases from Google Play Store
          try {
            if (typeof flushFailedPurchasesCachedAsPendingAndroid === 'function') {
              await flushFailedPurchasesCachedAsPendingAndroid().catch(() => {});
            }
            if (typeof getAvailablePurchases === 'function') {
              const available = await getAvailablePurchases().catch(() => []);
              if (Array.isArray(available) && available.length > 0) {
                console.log('[IAP Cleanup] Checking available purchases from Google Play:', available.length);
                for (const p of available) {
                  // Acknowledge without consuming so subscriptions stay active
                  await finishTransaction({ purchase: p, isConsumable: false }).catch(() => {});
                }
              }
            }
          } catch (cleanErr) {
            console.log('[IAP Cleanup Warning]:', cleanErr?.message);
          }

          console.log('[IAP Init] Querying Play Store Subscriptions & In-App SKUs:', SKUS);
          let allProds = [];

          // 1. Fetch recurring subscriptions (AutoPay)
          try {
            const subs = await fetchProducts({ skus: SKUS, type: 'subs' }).catch(() => []);
            if (Array.isArray(subs) && subs.length > 0) {
              console.log('[IAP Init] Fetched subscriptions (AutoPay):', subs.map((s) => s?.id || s?.productId));
              allProds.push(...subs);
            }
          } catch (subErr) {
            console.log('[IAP Init] fetchProducts(subs) notice:', subErr?.message);
          }

          // 2. Fetch in-app products (fallback/hybrid)
          try {
            const inapps = await fetchProducts({ skus: SKUS, type: 'in-app' }).catch(() => []);
            if (Array.isArray(inapps) && inapps.length > 0) {
              console.log('[IAP Init] Fetched in-app products:', inapps.map((s) => s?.id || s?.productId));
              for (const item of inapps) {
                const itemId = item?.id || item?.productId || item?.sku;
                if (!allProds.some((p) => (p?.id || p?.productId || p?.sku) === itemId)) {
                  allProds.push(item);
                }
              }
            }
          } catch (inappErr) {
            console.log('[IAP Init] fetchProducts(in-app) notice:', inappErr?.message);
          }

          if (isMounted && allProds.length > 0) {
            setSubscriptionsList(allProds);
          }
        }
      } catch (e) {
        console.log('[IAP Init Exception]:', e?.message || e);
      }
    }

    initIAP();

    return () => {
      isMounted = false;
      if (updateSub && typeof updateSub.remove === 'function') updateSub.remove();
      if (errorSub && typeof errorSub.remove === 'function') errorSub.remove();
    };
  }, [visible]);

  async function verifyAndActivatePurchase(purchaseToken, productId) {
    try {
      setLoading(true);
      let activePlanId = selectedPlan;
      if (productId) {
        const pid = String(productId).toLowerCase();
        if (pid.includes('weekly')) activePlanId = 'weekly';
        else if (pid.includes('yearly')) activePlanId = 'yearly';
        else if (pid.includes('monthly')) activePlanId = 'monthly';
      }

      console.log('[IAP Verification] Sending token to backend server...', {
        email: user?.email,
        productId,
        purchaseToken: purchaseToken ? purchaseToken.substring(0, 20) + '...' : '',
        activePlan: activePlanId,
      });

      const res = await fetch(`${API_BASE_URL}/api/payment/verify-play-purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'AnihubTeraSecureKey2026_xYz'
        },
        body: JSON.stringify({
          email: user?.email,
          purchaseToken: purchaseToken || `test_token_${Date.now()}`,
          productId: productId || activePlanId,
          plan: activePlanId,
        }),
      });
      const data = await res.json();
      console.log('[IAP Verification Response]:', JSON.stringify(data));
      setLoading(false);

      if (data && data.success) {
        Alert.alert(
          '🎉 VIP Premium Activated!',
          `Thank you for upgrading! Your ${activePlanId.toUpperCase()} plan is now active on Mobile App, Web & Telegram Bot.`
        );
        if (onPaymentSuccess) onPaymentSuccess(user?.email);
        if (onClose) onClose();
        return true;
      } else {
        if (data?.error && data.error.includes('already been redeemed')) {
          console.log('[IAP Verification] Token was already redeemed previously.');
        } else {
          Alert.alert('Activation Error', data?.error || 'Failed to activate plan on server.');
        }
        return false;
      }
    } catch (e) {
      setLoading(false);
      console.log('[IAP Verification Exception]:', e?.message || e);
      Alert.alert('Activation Error', 'Network error during plan activation.');
      return false;
    }
  }

  async function handleBuyNow() {
    console.log('[IAP Action] User clicked Pay button!');
    try {
      if (!user || !user.email) {
        console.log('[IAP Action] Rejected: User email not logged in');
        Alert.alert(
          '🔐 Sign In Required',
          'Please sign in with your Google Account first so your VIP plan can be linked to your email across App, Web & Telegram.',
          [{ text: 'OK' }]
        );
        return;
      }

      const currentPlan = plans.find((p) => p.id === selectedPlan);
      const storeProd = (subscriptionsList || []).find(
        (p) => p && (
          p.id === currentPlan?.sku || p.productId === currentPlan?.sku || p.sku === currentPlan?.sku ||
          p.id === currentPlan?.altSku || p.productId === currentPlan?.altSku || p.sku === currentPlan?.altSku
        )
      );
      const sku = storeProd?.id || storeProd?.productId || currentPlan?.sku || 'month_pro';
      console.log('[IAP Action] Target SKU:', sku, '| User Email:', user?.email);

      setLoading(true);

      // Check if this product has Google Play Subscription offers (AutoPay)
      const offers = storeProd?.subscriptionOffers;
      const firstOffer = Array.isArray(offers) && offers.length > 0 ? offers[0] : null;
      const offerToken = firstOffer?.offerTokenAndroid || firstOffer?.offerToken;
      const isSub = storeProd?.type === 'subs' || !!offerToken;

      console.log('[IAP Action] Launching Google Play Payment Sheet for SKU:', sku, {
        isSub,
        hasOfferToken: !!offerToken,
      });

      try {
        if (isSub) {
          // Launch Google Play Recurring Subscription (UPI AutoPay / Cards)
          const googleReq = { skus: [sku] };
          if (offerToken) {
            googleReq.subscriptionOffers = [{ sku, offerToken }];
          }
          await requestPurchase({
            type: 'subs',
            request: {
              google: googleReq,
              apple: { sku },
            },
          });
        } else {
          // Launch as standard purchase or fallback
          await requestPurchase({
            type: 'subs',
            request: {
              google: { skus: [sku] },
              apple: { sku },
            },
          }).catch(async (subFallbackErr) => {
            console.log('[IAP Action] Subs request fallback to in-app:', subFallbackErr?.message);
            await requestPurchase({
              type: 'in-app',
              request: {
                google: { skus: [sku] },
                apple: { sku },
              },
            });
          });
        }
      } catch (reqErr) {
        setLoading(false);
        console.log('[IAP Action Error] requestPurchase Exception:', JSON.stringify(reqErr || {}));
        const code = reqErr?.code || '';
        const msg = reqErr?.message || reqErr?.debugMessage || '';

        if (code === 'E_ALREADY_OWNED' || msg.toLowerCase().includes('already own')) {
          console.log('[IAP Action] Item already owned on Play Store. Acknowledging and syncing...');
          try {
            if (typeof getAvailablePurchases === 'function') {
              const available = await getAvailablePurchases().catch(() => []);
              if (Array.isArray(available) && available.length > 0) {
                for (const p of available) {
                  await finishTransaction({ purchase: p, isConsumable: false }).catch(() => {});
                }
              }
            }
          } catch (e) {}

          Alert.alert(
            '🔄 Active Subscription Found',
            'Your Google Play subscription was synced. If you want to change plans, please manage it in Google Play Store.',
            [{ text: 'OK' }]
          );
        } else if (code === 'E_USER_CANCELLED') {
          console.log('[IAP Action] User cancelled the payment prompt.');
        } else {
          Alert.alert('Payment Cancelled', msg || 'Could not complete Google Play purchase.');
        }
      }
    } catch (err) {
      setLoading(false);
      console.log('[IAP Action General Error]:', err?.message || err);
    }
  }

  // Active plan for dynamic features header
  const activePlan = plans.find((p) => p.id === selectedPlan) || plans[1];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
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
            {/* Dynamic Features Card based on selected plan */}
            <View style={styles.featuresCard}>
              <Text style={styles.featuresHeading}>{activePlan.heading}</Text>
              {activePlan.features.map((feat, idx) => (
                <View key={idx} style={styles.featureItem}>
                  <Ionicons name={feat.icon} size={18} color={feat.color} />
                  <Text style={styles.featureText}>{feat.text}</Text>
                </View>
              ))}
            </View>

            {/* Plans List */}
            <Text style={styles.selectPlanLabel}>Select Plan:</Text>
            {plans.map((item) => {
              const isSelected = selectedPlan === item.id;
              const storeProd = (subscriptionsList || []).find(
                (p) => p && (
                  p.id === item.sku || p.productId === item.sku || p.sku === item.sku ||
                  p.id === item.altSku || p.productId === item.altSku || p.sku === item.altSku
                )
              );
              // Dynamic price directly from Google Play Store (zero hardcoding)
              const displayPrice = storeProd?.displayPrice;

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
                    <View style={{ alignItems: 'flex-end', marginLeft: 6 }}>
                      {displayPrice ? (
                        <Text style={styles.planPrice}>{displayPrice}</Text>
                      ) : (
                        <ActivityIndicator size="small" color="#2563EB" style={{ paddingVertical: 4 }} />
                      )}
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

            {/* Google Play AutoPay Trust & Subscription Management Notice */}
            <View style={styles.autoPayNotice}>
              <View style={styles.autoPayRow}>
                <Ionicons name="repeat" size={16} color="#0284C7" />
                <Text style={styles.autoPayTitle}>Google Play AutoPay Supported</Text>
              </View>
              <Text style={styles.autoPayDesc}>
                Pay via UPI AutoPay (Google Pay, PhonePe, Paytm), Credit/Debit Card or NetBanking. Automatically renews until cancelled.
              </Text>
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.manageSubLink}
                onPress={() => {
                  Linking.openURL('https://play.google.com/store/account/subscriptions').catch(() => {
                    Alert.alert(
                      'Manage Subscriptions',
                      'Open Google Play Store ➡️ Profile ➡️ Payments & subscriptions to manage your AutoPay.'
                    );
                  });
                }}
              >
                <Text style={styles.manageSubText}>Manage or Cancel Subscriptions in Google Play</Text>
                <Ionicons name="open-outline" size={13} color="#2563EB" />
              </TouchableOpacity>
            </View>
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
  autoPayNotice: {
    backgroundColor: '#F0F9FF',
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  autoPayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  autoPayTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369A1',
  },
  autoPayDesc: {
    fontSize: 11.5,
    color: '#0C4A6E',
    lineHeight: 16,
  },
  manageSubLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E0F2FE',
  },
  manageSubText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#2563EB',
    textDecorationLine: 'underline',
  },
});
