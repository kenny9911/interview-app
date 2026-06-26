import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Screen, Display, PrimaryButton } from '../components/ui';
import { Orb } from '../components/Orb';
import { colors, fonts } from '../theme';
import { useNav } from '../navigation';
import { config } from '../config';

export default function WelcomeScreen() {
  const nav = useNav();
  return (
    <Screen gradient={{ colors: ['#3A2952', '#241634', '#170E26'], start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 0.9 } }} statusBar="light">
      <View style={{ flex: 1 }}>
        {/* brand */}
        <View style={{ paddingHorizontal: 30, paddingTop: 24, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.persimmon, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.display, color: '#fff', fontSize: 18 }}>v</Text>
          </View>
          <Text style={{ fontFamily: fonts.display, color: '#fff', fontSize: 18, letterSpacing: -0.2 }}>viva</Text>
        </View>

        {/* hero */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ marginBottom: 24 }}>
            <Orb size={140} rings={1} glow={false} />
          </View>
          <View style={{ paddingHorizontal: 34, alignItems: 'center' }}>
            <Display style={{ color: '#fff', fontSize: 32, lineHeight: 35, textAlign: 'center' }}>Your AI interview{'\n'}coach is ready.</Display>
            <Text style={{ fontFamily: fonts.text, fontSize: 15, lineHeight: 22, color: 'rgba(255,255,255,0.72)', marginTop: 14, textAlign: 'center' }}>
              Real interviews, mock rounds, skill drills and expert sessions — voice-first, in your language.
            </Text>
          </View>
        </View>

        {/* footer */}
        <View style={{ paddingHorizontal: 26, paddingBottom: 12 }}>
          <PrimaryButton label="Get started" fontSize={16.5} padding={17} onPress={() => nav.navigate('SignUp')} />
          <Text style={{ textAlign: 'center', marginTop: 16, fontSize: 14.5, color: 'rgba(255,255,255,0.7)', fontFamily: fonts.text }}>
            Already have an account?{' '}
            <Text
              style={{ color: '#fff', fontFamily: fonts.bold }}
              onPress={() => nav.navigate('SignIn')}
              accessibilityRole="link"
              accessibilityLabel="Sign in"
            >
              Sign in
            </Text>
          </Text>
          {__DEV__ && config.liveEnabled ? (
            <Pressable onPress={() => nav.navigate('LiveTest')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dev: live stack test">
              <Text style={{ textAlign: 'center', marginTop: 14, fontSize: 12.5, color: 'rgba(255,255,255,0.45)', fontFamily: fonts.semibold }}>
                Dev · live stack test
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
