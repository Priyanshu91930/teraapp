import React, { useState } from 'react';
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

const API_BASE_URL = 'https://api.teraboxdownloader.co.in';

export default function SubscriptionModal({ visible, onClose, user, onPaymentSuccess }) {
  const [selectedPlan, setSelectedPlan] = useState('monthly'); // 'weekly', 'monthly', 'yearly'
  const [loading, setLoading] = useState(false);

  const plans = [
    {
      id: 'weekly',
      name: 'Weekly Pass',
      price: '₹49',
      duration: '7 Days Access',
      badge: null,
      desc: 'Ideal for short-term fast downloads',
    },
    {
      id: 'monthly',
      name: 'Monthly Pro',
      price: '₹99',
      duration: '30 Days Access',
      badge: 'MOST POPULAR',
      desc: 'Unlimited speed + Web & App Sync',
    },
    {
      id: 'yearly',
      name: 'Yearly VIP',
      price: '₹499',
      duration: '365 Days Access',
      badge: 'SAVE 75%',
      desc: 'Best value for frequent downloaders',
    },
  ];

  async function handleBuyNow() {
    if (!user || !user.email) {
      Alert.alert(
        '🔐 Login Required',
        'Please sign in with your Google Email first to purchase and link your premium plan.',
        [{ text: 'OK' }]
      );
      return;
    }

    setLoading(true);
    try {
      // 1. Create Razorpay order on backend
      const orderRes = await fetch(`${API_BASE_URL}/api/payment/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, plan: selectedPlan }),
      });

      const orderData = await orderRes.json();
      if (!orderData.success || !orderData.orderId) {
        throw new Error(orderData.error || 'Failed to initialize payment gateway.');
      }

      // 2. Open Razorpay Checkout via Website Gateway
      const checkoutUrl = `https://teraboxdownloader.co.in/checkout.php?plan=${selectedPlan}&email=${encodeURIComponent(user.email)}&order_id=${orderData.orderId}`;
      
      Alert.alert(
        '💳 Razorpay Checkout',
        `Proceed to pay ${selectedPlan === 'weekly' ? '₹49' : selectedPlan === 'yearly' ? '₹499' : '₹99'} for ${selectedPlan.toUpperCase()} Premium?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setLoading(false) },
          {
            text: 'Pay Now',
            onPress: async () => {
              try {
                await Linking.openURL(checkoutUrl);
                // Simulate/Check payment completion after user returns
                setTimeout(async () => {
                  setLoading(false);
                  if (onPaymentSuccess) onPaymentSuccess(user.email);
                }, 3000);
              } catch (e) {
                setLoading(false);
                Alert.alert('Error', 'Could not open payment gateway.');
              }
            },
          },
        ]
      );
    } catch (err) {
      setLoading(false);
      Alert.alert('Payment Error', err.message || 'Something went wrong while starting checkout.');
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="sparkles" size={22} color="#F59E0B" />
              <Text style={styles.headerTitle}>Upgrade to Premium</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            {/* Features */}
            <View style={styles.featuresCard}>
              <Text style={styles.featuresHeading}>✨ What You Get:</Text>
              <View style={styles.featureItem}>
                <Ionicons name="sparkles" size={18} color="#F59E0B" />
                <Text style={styles.featureText}>100% Ad-Free Experience in App</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="globe-outline" size={18} color="#3B82F6" />
                <Text style={styles.featureText}>Full Premium Access on Website (teraboxdownloader.co.in)</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="paper-plane-outline" size={18} color="#0EA5E9" />
                <Text style={styles.featureText}>Direct Files in Telegram Bot</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="flash" size={18} color="#10B981" />
                <Text style={styles.featureText}>10x Superfast High-Speed Download Links</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="film" size={18} color="#6366F1" />
                <Text style={styles.featureText}>1080p HD Video Streaming & Multi-Quality</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="infinite" size={18} color="#EC4899" />
                <Text style={styles.featureText}>Unlimited Daily Links & Zero Captchas</Text>
              </View>
            </View>

            {/* Plans List */}
            <Text style={styles.selectPlanLabel}>Select Plan:</Text>
            {plans.map((item) => {
              const isSelected = selectedPlan === item.id;
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
                      <Text style={styles.planPrice}>{item.price}</Text>
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
                  <ActivityIndicator color="#FFFFFF" />
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
    gap: 8,
    marginVertical: 4,
  },
  featureText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
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
