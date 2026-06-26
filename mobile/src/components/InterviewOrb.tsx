// Orb-as-honest-state-machine (docs/15-decisions.md D7). Maps the live agent
// state to the orb's visual treatment, and carries the state in an accessible
// status label so reduced-motion / VoiceOver users get the same information.
import React from 'react';
import { View, Text, AccessibilityInfo } from 'react-native';
import { Orb } from './Orb';
import { colors, fonts } from '../theme';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted';

const LABEL: Record<OrbState, string> = {
  idle: 'Ready',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  interrupted: 'Go ahead…', // barge-in acknowledgement (D7)
};

export function InterviewOrb({ orbState, size = 188, name }: { orbState: OrbState; size?: number; name?: string }) {
  // Announce state CHANGES for screen readers, but DEBOUNCE: the orb can flip
  // speaking→listening→thinking within a second, and announcing each flip spams
  // VoiceOver. Only a state that settles for 450ms is spoken. This is the single
  // announcer — the visible label below is NOT a live region (would double-speak).
  // Skip the initial mount: the focusable container's accessibilityLabel already
  // conveys the starting state, so announcing it would interrupt VoiceOver's
  // natural read of the screen on entry.
  const mountedRef = React.useRef(false);
  React.useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    const id = setTimeout(() => AccessibilityInfo.announceForAccessibility?.(LABEL[orbState]), 450);
    return () => clearTimeout(id);
  }, [orbState]);

  const speaking = orbState === 'speaking';
  const active = orbState === 'listening' || orbState === 'speaking';

  return (
    <View style={{ alignItems: 'center', gap: 14 }} accessibilityRole="image" accessibilityLabel={`Interviewer ${LABEL[orbState]}`}>
      <Orb size={size} rings={active ? 2 : 1} glow={orbState !== 'idle'} voiceBars={speaking} />
      <View style={{ alignItems: 'center' }}>
        {name ? <Text style={{ fontFamily: fonts.display, color: '#fff', fontSize: 19 }}>{name}</Text> : null}
        {/* visible only — the debounced announce above is the single SR announcer */}
        <Text accessibilityLiveRegion="none" style={{ fontFamily: fonts.semibold, color: colors.persimmonL, fontSize: 13, marginTop: 2 }}>
          {LABEL[orbState]}
        </Text>
      </View>
    </View>
  );
}
