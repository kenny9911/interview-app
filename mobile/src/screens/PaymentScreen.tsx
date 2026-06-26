import React from 'react';
import { View } from 'react-native';
import { ScreenScroll, Display, Label, T, PrimaryButton, BackButton, Card, IconCircle } from '../components/ui';
import { colors, fonts } from '../theme';
import { useNav } from '../navigation';
import { ChevronLeft, Lock, Check } from '../icons';

// Honest pre-IAP state. We do NOT ship a fake checkout — Apple requires real
// In-App Purchase (StoreKit) for digital subscriptions, which is configured in
// App Store Connect by the owner. Until that lands, everyone has full access and
// we say so plainly rather than rendering placeholder card UI.
export default function PaymentScreen() {
  const nav = useNav();
  return (
    <ScreenScroll
      footer={
        <View style={{ paddingHorizontal: 22, paddingBottom: 10, paddingTop: 10 }}>
          <PrimaryButton label="Keep practicing" fontSize={16.5} padding={17} onPress={() => nav.navigate('Home')} />
        </View>
      }
    >
      <View style={{ paddingHorizontal: 22, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={() => nav.navigate('Plans')}>
          <ChevronLeft size={18} color={colors.ink} />
        </BackButton>
        <Display style={{ fontSize: 21 }}>Upgrades</Display>
      </View>

      <View style={{ alignItems: 'center', paddingHorizontal: 30, paddingTop: 36 }}>
        <IconCircle bg={colors.tintViolet} size={72} br={22}>
          <Lock size={30} color={colors.tintVioletText} />
        </IconCircle>
        <Label style={{ marginTop: 22, color: colors.persimmonD }}>COMING SOON</Label>
        <Display style={{ fontSize: 25, textAlign: 'center', marginTop: 8 }}>Paid plans are on the way</Display>
        <T style={{ fontSize: 14.5, lineHeight: 21, color: colors.muted, textAlign: 'center', marginTop: 12, maxWidth: 320 }}>
          In-app subscriptions will arrive through the App Store. Until then you have full access to viva — no payment needed.
        </T>
      </View>

      <Card style={{ marginHorizontal: 22, marginTop: 26, borderRadius: 20, padding: 18, gap: 12 }}>
        {[
          'Unlimited practice interviews during launch',
          'Every scored report and transcript, kept for you',
          'You’ll be told before anything ever costs money',
        ].map((line) => (
          <View key={line} style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.tintCoral, alignItems: 'center', justifyContent: 'center' }}>
              <Check size={12} color={colors.tintCoralText} strokeWidth={3} />
            </View>
            <T style={{ flex: 1, fontSize: 13.5, color: colors.ink, fontFamily: fonts.text }}>{line}</T>
          </View>
        ))}
      </Card>

      <View style={{ height: 16 }} />
    </ScreenScroll>
  );
}
