import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ScreenScroll, Display, T, PrimaryButton, BackButton,
} from '../components/ui';
import { colors, fonts, radius } from '../theme';
import { useNav } from '../navigation';
import { Close, Check } from '../icons';

export default function PlansScreen() {
  const nav = useNav();

  return (
    <ScreenScroll
      footer={
        <View style={{ paddingHorizontal: 22, paddingBottom: 8, paddingTop: 10 }}>
          <PrimaryButton label="See upgrade details" onPress={() => nav.navigate('Payment')} />
          <Text style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: colors.faint, fontFamily: fonts.text }}>
            Plans launch soon · full access during launch
          </Text>
        </View>
      }
    >
      {/* header */}
      <View style={{ paddingHorizontal: 22, paddingTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <BackButton onPress={() => nav.navigate('Home')}>
          <Close size={14} color={colors.ink} />
        </BackButton>
        <Display style={{ fontSize: 16 }}>Choose your plan</Display>
        <View style={{ width: 38 }} />
      </View>

      {/* hero + toggle */}
      <View style={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 4, alignItems: 'center' }}>
        <Display style={{ fontSize: 26, lineHeight: 29, textAlign: 'center', letterSpacing: -0.26 }}>
          Interview as much{'\n'}as you need.
        </Display>
        {/* Honest pricing preview — these tiers aren't purchasable yet (no fake toggle). */}
        <View style={{ marginTop: 14, backgroundColor: colors.tintSand, paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 11.5, letterSpacing: 0.5, color: colors.tintSandText }}>PRICING PREVIEW · LAUNCHING SOON</Text>
        </View>
      </View>

      {/* plan cards */}
      <View style={{ paddingHorizontal: 22, paddingTop: 18, gap: 12 }}>
        {/* Standard */}
        <View style={{ backgroundColor: colors.white, borderWidth: 1, borderColor: colors.hairline, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Display style={{ fontSize: 17 }}>Standard</Display>
            <T style={{ fontSize: 12.5, color: colors.muted, marginTop: 2 }}>10 interviews / month</T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Display style={{ fontSize: 19 }}>$12.99</Display>
            <T style={{ fontSize: 11, color: colors.muted }}>per month</T>
          </View>
        </View>

        {/* Plus (featured) */}
        <LinearGradient
          colors={[colors.plum2, colors.plum3]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={{ borderRadius: 22, paddingVertical: 18, paddingHorizontal: 17, overflow: 'hidden' }}
        >
          {/* faint corner glow */}
          <LinearGradient
            colors={['rgba(255,88,54,0.30)', 'rgba(255,88,54,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', right: -26, top: -26, width: 110, height: 110, borderRadius: 55 }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontFamily: fonts.display, color: colors.white, fontSize: 18 }}>Plus</Text>
              <View style={{ backgroundColor: colors.persimmon, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.pill }}>
                <Text style={{ fontFamily: fonts.bold, color: colors.white, fontSize: 10, letterSpacing: 0.4 }}>BEST VALUE</Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontFamily: fonts.display, color: colors.white, fontSize: 21 }}>$24.99</Text>
              <Text style={{ fontFamily: fonts.text, fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>per month</Text>
            </View>
          </View>
          <Text style={{ fontFamily: fonts.text, fontSize: 12.5, color: 'rgba(255,255,255,0.78)', marginTop: 6 }}>30 interviews / month</Text>
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.14)', marginVertical: 14 }} />
          <View style={{ gap: 8 }}>
            {['Full scorecards & transcripts', 'All interviewer styles & voices', '40+ languages'].map((f) => (
              <View key={f} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <Check size={15} color={colors.persimmonL} />
                <Text style={{ fontFamily: fonts.text, fontSize: 13, color: colors.white }}>{f}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        {/* Max */}
        <View style={{ backgroundColor: colors.white, borderWidth: 1, borderColor: colors.hairline, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Display style={{ fontSize: 17 }}>Max</Display>
              <View style={{ backgroundColor: colors.tintSand, paddingVertical: 2, paddingHorizontal: 7, borderRadius: radius.pill }}>
                <Text style={{ fontFamily: fonts.bold, color: colors.tintSandText, fontSize: 10 }}>TEAMS</Text>
              </View>
            </View>
            <T style={{ fontSize: 12.5, color: colors.muted, marginTop: 2 }}>300 interviews / month</T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Display style={{ fontSize: 19 }}>$99</Display>
            <T style={{ fontSize: 11, color: colors.muted }}>per month</T>
          </View>
        </View>
      </View>
    </ScreenScroll>
  );
}
