// The persimmon "AI" orb — breathing sphere, pulsing rings, soft glow, and
// optional voice bars. Uses the built-in Animated API (no Reanimated/worklets)
// so it runs in Expo Go on both iOS and Android with zero native setup.
import React, { useEffect, useRef, useState } from 'react';
import { View, Animated, Easing, StyleSheet, AccessibilityInfo } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';

type Stops = readonly { offset: number; color: string }[];

const ORB_STOPS: Stops = [
  { offset: 0, color: '#FFE3CE' },
  { offset: 0.28, color: '#FF8A5C' },
  { offset: 0.64, color: '#FF5836' },
  { offset: 1, color: '#8C2810' },
];

// Honor the OS "reduce motion" setting (D7 accessibility requirement).
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (alive) setReduce(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => setReduce(!!v));
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  return reduce;
}

function useLoop(make: () => Animated.CompositeAnimation, enabled: boolean, deps: any[] = []) {
  const ref = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (!enabled) return;
    ref.current = make();
    ref.current.start();
    return () => ref.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
}

function Ring({ size, delay, color, reduce }: { size: number; delay: number; color: string; reduce: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useLoop(() =>
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 3200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ])
    ), !reduce
  );
  if (reduce) return null; // no pulsing rings under reduced motion
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.75] });
  const opacity = v.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0.55, 0, 0] });
  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { alignItems: 'center', justifyContent: 'center', transform: [{ scale }], opacity },
      ]}
      pointerEvents="none"
    >
      <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: color }} />
    </Animated.View>
  );
}

function Bar({ height, delay, reduce }: { height: number; delay: number; reduce: boolean }) {
  const v = useRef(new Animated.Value(0.3)).current;
  useLoop(() =>
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.3, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ), !reduce
  );
  if (reduce) return <View style={{ width: 5, height: height * 0.7, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.9)' }} />;
  return <Animated.View style={{ width: 5, height, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.9)', transform: [{ scaleY: v }] }} />;
}

export function Orb({
  size = 188,
  rings = 2,
  glow = true,
  voiceBars = false,
  ringColor = 'rgba(255,138,92,0.5)',
}: {
  size?: number;
  rings?: 0 | 1 | 2;
  glow?: boolean;
  voiceBars?: boolean;
  ringColor?: string;
}) {
  const breathe = useRef(new Animated.Value(0)).current;
  const glowV = useRef(new Animated.Value(0)).current;
  const reduce = useReducedMotion();

  useLoop(() =>
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ), !reduce
  );
  useLoop(() =>
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowV, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowV, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ), !reduce
  );

  const orbScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const glowScale = glowV.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.06] });
  const glowOpacity = glowV.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const glowSize = size * 1.6;
  const box = glow ? glowSize : size * 1.4;

  const barHeights = [16, 30, 42, 26, 19];

  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      {glow && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', transform: [{ scale: glowScale }], opacity: glowOpacity }]}
          pointerEvents="none"
        >
          <Svg width={glowSize} height={glowSize}>
            <Defs>
              <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#FF5836" stopOpacity={0.4} />
                <Stop offset="0.62" stopColor="#FF5836" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={glowSize / 2} cy={glowSize / 2} r={glowSize / 2} fill="url(#glow)" />
          </Svg>
        </Animated.View>
      )}

      {rings >= 1 && <Ring size={size} delay={0} color={ringColor} reduce={reduce} />}
      {rings >= 2 && <Ring size={size} delay={1600} color={ringColor} reduce={reduce} />}

      <Animated.View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: [{ scale: orbScale }] }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="orb" cx="36%" cy="30%" r="72%">
              {ORB_STOPS.map((s, i) => (
                <Stop key={i} offset={s.offset} stopColor={s.color} />
              ))}
            </RadialGradient>
          </Defs>
          <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#orb)" />
        </Svg>
        {voiceBars && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 42 }}>
            {barHeights.map((h, i) => (
              <Bar key={i} height={h} delay={i * 150} reduce={reduce} />
            ))}
          </View>
        )}
      </Animated.View>
    </View>
  );
}
