import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ScreenScroll, Display, Card, IconCircle, PrimaryButton, BackButton } from '../components/ui';
import { colors, fonts, radius } from '../theme';
import { useNav } from '../navigation';
import { ChevronLeft, ChevronDown, Globe, Play, Briefcase, Bulb, BarChart, GradCap, Close } from '../icons';

type ModeId = 'mock' | 'real' | 'topic_practice' | 'capability_assessment' | 'expert_interview';

type Mode = {
  id: ModeId;
  title: string;
  sub: string;
  bg: string;
  fg: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  badge?: { text: string; bg: string; fg: string };
};

const MODES: Mode[] = [
  {
    id: 'mock',
    title: 'Mock interview',
    sub: 'A full practice round, scored like the real thing.',
    bg: colors.tintCoral, fg: colors.tintCoralText, icon: Play,
    badge: { text: 'POPULAR', bg: colors.tintCoral, fg: colors.tintCoralText },
  },
  {
    id: 'real',
    title: 'Real interview',
    sub: 'Take a scheduled interview from an employer.',
    bg: colors.tintSand, fg: colors.tintSandText, icon: Briefcase,
    badge: { text: 'INVITE', bg: '#F1EDE2', fg: colors.muted },
  },
  {
    id: 'topic_practice',
    title: 'Topic practice',
    sub: 'Drill a specific skill with instant coaching.',
    bg: colors.tintViolet, fg: colors.tintVioletText, icon: Bulb,
  },
  {
    id: 'capability_assessment',
    title: 'Capability assessment',
    sub: 'Get evaluated by your employer on real skills.',
    bg: colors.tintSand, fg: colors.tintSandText, icon: BarChart,
  },
  {
    id: 'expert_interview',
    title: 'Expert interview',
    sub: 'Interview an expert AI to extract know-how.',
    bg: colors.tintCoral, fg: colors.tintCoralText, icon: GradCap,
  },
];

const SETUP_MODES: ModeId[] = ['mock', 'topic_practice', 'capability_assessment'];

export default function ChooseModeScreen() {
  const nav = useNav();
  const [selectedId, setSelectedId] = useState<ModeId>('mock');
  const [comingSoon, setComingSoon] = useState(false);

  const selected = MODES.find((m) => m.id === selectedId)!;

  function confirm(mode: ModeId) {
    if (SETUP_MODES.includes(mode)) {
      nav.navigate('Setup', { mode });
    } else {
      setComingSoon(true);
    }
  }

  return (
    <ScreenScroll
      footer={
        <View style={{ paddingHorizontal: 22, paddingBottom: 8, paddingTop: 10 }}>
          <PrimaryButton label={`Continue with ${selected.title}`} onPress={() => confirm(selectedId)} />
        </View>
      }
    >
      {/* header */}
      <View style={{ paddingHorizontal: 22, paddingTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <BackButton onPress={() => nav.navigate('Home')}>
          <ChevronLeft size={18} color={colors.ink} />
        </BackButton>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 }}>
          <Globe size={16} color={colors.persimmonD} />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink }}>English</Text>
          <ChevronDown size={11} color={colors.ink} />
        </View>
      </View>

      {/* title */}
      <View style={{ paddingHorizontal: 22, paddingTop: 22, paddingBottom: 8 }}>
        <Display style={{ fontSize: 28, lineHeight: 31, letterSpacing: -0.28 }}>What do you{'\n'}want to do?</Display>
      </View>

      {/* mode rows */}
      <View style={{ paddingHorizontal: 22, paddingTop: 10, gap: 12 }}>
        {MODES.map((m) => {
          const Icon = m.icon;
          const isSelected = m.id === selectedId;
          return (
            <Card
              key={m.id}
              onPress={() => setSelectedId(m.id)}
              accessibilityLabel={`${m.title}. ${m.sub}`}
              accessibilityState={{ selected: isSelected }}
              style={[
                { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
                isSelected && { borderWidth: 2, borderColor: colors.persimmon },
              ]}
            >
              <IconCircle bg={m.bg} size={46} br={13}>
                <Icon size={23} color={m.fg} />
              </IconCircle>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 16.5, color: colors.ink }}>{m.title}</Text>
                  {isSelected && m.badge && (
                    <Badge text={m.badge.text} bg={m.badge.bg} fg={m.badge.fg} />
                  )}
                </View>
                <Text style={{ fontFamily: fonts.text, fontSize: 12.5, lineHeight: 16.5, color: colors.muted, marginTop: 3 }}>{m.sub}</Text>
              </View>
              {!isSelected && m.badge && (
                <Badge text={m.badge.text} bg={m.badge.bg} fg={m.badge.fg} />
              )}
            </Card>
          );
        })}
      </View>

      {/* coming soon sheet */}
      {comingSoon && (
        <View
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(34,24,46,0.45)',
            justifyContent: 'flex-end',
          }}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setComingSoon(false)} />
          <View
            style={{
              backgroundColor: colors.bone,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              paddingHorizontal: 24,
              paddingTop: 18,
              paddingBottom: 34,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Display style={{ fontSize: 22, lineHeight: 25, letterSpacing: -0.22 }}>Coming soon</Display>
              </View>
              <Pressable
                onPress={() => setComingSoon(false)}
                hitSlop={10}
                style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.hairline }}
              >
                <Close size={15} color={colors.ink} />
              </Pressable>
            </View>
            <Text style={{ fontFamily: fonts.text, fontSize: 14.5, lineHeight: 21, color: colors.muted, marginTop: 10 }}>
              These modes need an employer invite. Once an employer invites you, they'll show up here ready to go.
            </Text>
            <View style={{ marginTop: 18 }}>
              <PrimaryButton label="Got it" onPress={() => setComingSoon(false)} />
            </View>
          </View>
        </View>
      )}
    </ScreenScroll>
  );
}

function Badge({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={{ backgroundColor: bg, paddingVertical: 2.5, paddingHorizontal: 9, borderRadius: radius.pill }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.3, color: fg }}>{text}</Text>
    </View>
  );
}
