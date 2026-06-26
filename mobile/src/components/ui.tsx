// Shared building blocks for every screen. Keeping these tight means each
// screen file stays declarative and visually consistent.
import React from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView,
  ViewStyle, TextStyle, StyleProp, AccessibilityState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient, LinearGradientPoint } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts, radius } from '../theme';

type Kids = { children?: React.ReactNode };

/* ---------- Screen scaffolds ---------- */

type Gradient = { colors: readonly [string, string, ...string[]]; start?: LinearGradientPoint; end?: LinearGradientPoint };

export function Screen({
  children, bg, gradient, statusBar = 'dark', edges = ['top', 'bottom'],
}: Kids & { bg?: string; gradient?: Gradient; statusBar?: 'light' | 'dark'; edges?: ('top' | 'bottom')[] }) {
  return (
    <View style={{ flex: 1, backgroundColor: bg ?? colors.bone }}>
      <StatusBar style={statusBar} />
      {gradient && (
        <LinearGradient
          colors={gradient.colors}
          start={gradient.start ?? { x: 0.5, y: 0 }}
          end={gradient.end ?? { x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <SafeAreaView style={{ flex: 1 }} edges={edges}>{children}</SafeAreaView>
    </View>
  );
}

// Scrollable body + an optional footer pinned below the scroll area.
export function ScreenScroll({
  children, footer, bg, contentStyle,
}: Kids & { footer?: React.ReactNode; bg?: string; contentStyle?: StyleProp<ViewStyle> }) {
  return (
    <Screen bg={bg}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[{ flexGrow: 1 }, contentStyle]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer}
    </Screen>
  );
}

/* ---------- Text helpers ---------- */

export function Display({ children, style }: Kids & { style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontFamily: fonts.display, color: colors.ink, letterSpacing: -0.4 }, style]}>{children}</Text>;
}

export function Label({ children, style }: Kids & { style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[{ fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.1, color: colors.muted, textTransform: 'uppercase' }, style]}>
      {children}
    </Text>
  );
}

export function T({ children, style }: Kids & { style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontFamily: fonts.text, color: colors.ink }, style]}>{children}</Text>;
}

/* ---------- Controls ---------- */

export function PrimaryButton({
  label, onPress, rightIcon, fontSize = 16, padding = 16, style,
}: { label: string; onPress?: () => void; rightIcon?: React.ReactNode; fontSize?: number; padding?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.cta, { padding, opacity: pressed ? 0.92 : 1 }, style]}>
      <Text style={[styles.ctaText, { fontSize }]}>{label}</Text>
      {rightIcon}
    </Pressable>
  );
}

export function BackButton({ onPress, children }: { onPress?: () => void } & Kids) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onPress} style={styles.circleBtn} hitSlop={8}>
      {children}
    </Pressable>
  );
}

/* ---------- Surfaces ---------- */

export function Card({ children, style, onPress, accessibilityLabel, accessibilityState }: Kids & { style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string; accessibilityState?: AccessibilityState }) {
  // Apply layout/visual style to the outermost element so percentage widths and
  // flex sizing resolve against the parent (not a content-sized wrapper).
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={accessibilityState} style={({ pressed }) => [styles.card, style, { opacity: pressed ? 0.95 : 1 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]} accessibilityLabel={accessibilityLabel} accessibilityState={accessibilityState}>{children}</View>;
}

export function IconCircle({ children, bg, size = 40, br = 12 }: Kids & { bg: string; size?: number; br?: number }) {
  return <View style={{ width: size, height: size, borderRadius: br, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>{children}</View>;
}

export function Divider({ color = colors.hairline2, vertical = false, style }: { color?: string; vertical?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[vertical ? { width: 1, alignSelf: 'stretch' } : { height: 1 }, { backgroundColor: color }, style]} />;
}

// Gradient avatar circle with an initial (Home greeting, hero logo, etc.)
export function GradientCircle({
  size, br, colors: g, children, style,
}: Kids & { size: number; br?: number; colors: readonly [string, string, ...string[]]; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient
      colors={g}
      start={{ x: 0.3, y: 0.2 }}
      end={{ x: 0.8, y: 1 }}
      style={[{ width: size, height: size, borderRadius: br ?? size / 2, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      {children}
    </LinearGradient>
  );
}

export const styles = StyleSheet.create({
  cta: {
    backgroundColor: colors.persimmon,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
    shadowColor: colors.persimmon,
    shadowOpacity: 0.32,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  ctaText: { color: colors.white, fontFamily: fonts.bold },
  circleBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, // 44pt min tap target (HIG/WCAG)
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.hairline,
  },
  card: {
    backgroundColor: colors.white, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.hairline,
  },
});
