import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Display, T, Card, IconCircle, GradientCircle } from '../components/ui';
import { colors, fonts } from '../theme';
import { useNav } from '../navigation';
import { api } from '../api';
import { Play, Bulb, BarChart, GradCap, HomeFilled, Target, Calendar, Person } from '../icons';

const PRACTICE = [
  { title: 'Mock interview', sub: 'Full scored round', bg: colors.tintCoral, fg: colors.tintCoralText, icon: Play },
  { title: 'Topic practice', sub: 'Drill a skill', bg: colors.tintViolet, fg: colors.tintVioletText, icon: Bulb },
  { title: 'Capability test', sub: 'From your employer', bg: colors.tintSand, fg: colors.tintSandText, icon: BarChart },
  { title: 'Expert interview', sub: 'Extract know-how', bg: colors.tintCoral, fg: colors.tintCoralText, icon: GradCap },
];

export default function HomeScreen() {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const [hasSessions, setHasSessions] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { sessions } = await api.listSessions();
        if (active) setHasSessions(sessions.length > 0);
      } catch {
        // Resilient: if the API call fails, leave the hero hidden.
        if (active) setHasSessions(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Screen edges={['top']}>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          {/* header */}
          <View style={{ paddingHorizontal: 22, paddingTop: 12, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View>
              <T style={{ fontSize: 13, color: colors.muted, marginBottom: 3 }}>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</T>
              <Display style={{ fontSize: 27 }}>Hi there</Display>
            </View>
            <Pressable onPress={() => nav.navigate('DataPrivacy')} accessibilityRole="button" accessibilityLabel="Profile and settings">
              <GradientCircle size={46} colors={['#FF8A5C', '#D8401C']}>
                <Person size={22} color="#fff" />
              </GradientCircle>
            </Pressable>
          </View>

          {/* warm start-practicing prompt (replaces the fake scheduled hero) */}
          <Pressable onPress={() => nav.navigate('ChooseMode')} style={{ marginHorizontal: 22, marginTop: 20 }}>
            <Card style={{ padding: 20, borderWidth: 0 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.4, color: colors.persimmonD, marginBottom: 10 }}>
                {hasSessions ? 'KEEP IT UP' : 'GET STARTED'}
              </Text>
              <Display style={{ fontSize: 21, marginBottom: 6 }}>
                {hasSessions ? 'Ready for another round?' : 'Start practicing'}
              </Display>
              <Text style={{ fontFamily: fonts.text, fontSize: 14, color: colors.muted, lineHeight: 20 }}>
                {hasSessions
                  ? 'Pick a mode below and sharpen your answers with a quick session.'
                  : 'Run a realistic interview, get scored, and see exactly what to work on.'}
              </Text>
            </Card>
          </Pressable>

          {/* start practicing */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 22, marginTop: 26, marginBottom: 14 }}>
            <Display style={{ fontSize: 18 }}>Practice modes</Display>
            <Pressable onPress={() => nav.navigate('ChooseMode')} hitSlop={8} accessibilityRole="button" accessibilityLabel="See all practice modes">
              <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.persimmonD }}>See all</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 22, gap: 13 }}>
            {PRACTICE.map((p) => {
              const Icon = p.icon;
              return (
                <Card key={p.title} onPress={() => nav.navigate('ChooseMode')} style={{ width: '47%', flexGrow: 1, padding: 16, minHeight: 128, borderWidth: 0, justifyContent: 'space-between' }}>
                  <IconCircle bg={p.bg}><Icon size={21} color={p.fg} /></IconCircle>
                  <View>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 15.5, color: colors.ink }}>{p.title}</Text>
                    <Text style={{ fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 }}>{p.sub}</Text>
                  </View>
                </Card>
              );
            })}
          </View>
        </View>

        {/* tab bar */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingTop: 12, paddingBottom: insets.bottom + 8, backgroundColor: 'rgba(244,239,228,0.95)', borderTopWidth: 1, borderTopColor: 'rgba(31,26,23,0.07)' }}>
          <Tab label="Home" active><HomeFilled size={23} color={colors.persimmonD} /></Tab>
          <Tab label="Practice" onPress={() => nav.navigate('ChooseMode')}><Target size={23} color="#aba593" /></Tab>
          <Tab label="Interviews" onPress={() => nav.navigate('History')}><Calendar size={23} color="#aba593" /></Tab>
          <Tab label="Profile" onPress={() => nav.navigate('DataPrivacy')}><Person size={23} color="#aba593" /></Tab>
        </View>
      </View>
    </Screen>
  );
}

function Tab({ label, active, onPress, children }: { label: string; active?: boolean; onPress?: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={label}
      style={{ alignItems: 'center', gap: 4 }}
    >
      {children}
      <Text style={{ fontSize: 10.5, fontFamily: active ? fonts.bold : fonts.semibold, color: active ? colors.persimmonD : '#aba593' }}>{label}</Text>
    </Pressable>
  );
}
