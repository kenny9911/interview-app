// Analyzing screen (docs D11). Bridges the live interview and the report:
// on mount we ask the backend to score the session, then replace into Results.
// If the session had too little signal to score, we show a gentle empty state;
// other failures get one silent retry before surfacing an error — both route
// back Home so the user never gets stuck on a spinner.
import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Screen, Display, Label, T, PrimaryButton } from '../components/ui';
import { InterviewOrb } from '../components/InterviewOrb';
import { colors, fonts } from '../theme';
import { useNav, useRouteParams } from '../navigation';
import { api, ApiError } from '../api';
import { config } from '../config';

type Phase = 'analyzing' | 'empty' | 'error' | 'demo';

export default function AnalyzingScreen() {
  const nav = useNav();
  const { sessionId } = useRouteParams<'Analyzing'>();
  const [phase, setPhase] = React.useState<Phase>('analyzing');

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      // UI-only demo mode (no backend session): don't call the API — show a
      // friendly demo-complete terminal instead of 404-ing.
      if (!config.liveEnabled || sessionId.startsWith('demo-')) {
        if (!cancelled) setPhase('demo');
        return;
      }
      try {
        await api.complete(sessionId);
        if (!cancelled) nav.replace('Results', { sessionId });
        return;
      } catch (err) {
        // Too little was said to produce a fair score — friendly empty state.
        if (err instanceof ApiError && err.body.includes('not_enough_to_score')) {
          if (!cancelled) setPhase('empty');
          return;
        }
        // Anything else: try once more before giving up.
        try {
          await api.complete(sessionId);
          if (!cancelled) nav.replace('Results', { sessionId });
          return;
        } catch (err2) {
          if (err2 instanceof ApiError && err2.body.includes('not_enough_to_score')) {
            if (!cancelled) setPhase('empty');
            return;
          }
          if (!cancelled) setPhase('error');
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <Screen
      statusBar="light"
      gradient={{ colors: [colors.plum2, colors.plum3, colors.plumDeep] }}
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        {phase === 'analyzing' && (
          <View style={{ alignItems: 'center' }}>
            <InterviewOrb orbState="thinking" size={188} />
            <Label style={{ fontSize: 11, letterSpacing: 1.6, color: colors.persimmonL, marginTop: 34 }}>
              ONE MOMENT
            </Label>
            <Display style={{ fontSize: 26, color: colors.white, marginTop: 8, textAlign: 'center' }}>
              Analyzing your interview…
            </Display>
            <T style={{ fontSize: 14.5, lineHeight: 21, color: colors.sand, marginTop: 12, textAlign: 'center', maxWidth: 300 }}>
              We're reviewing what you said and putting together honest, specific feedback. This takes a few seconds.
            </T>
            <ActivityIndicator color={colors.persimmonL} style={{ marginTop: 26 }} />
          </View>
        )}

        {phase === 'empty' && (
          <View style={{ alignItems: 'center' }}>
            <InterviewOrb orbState="idle" size={156} />
            <Label style={{ fontSize: 11, letterSpacing: 1.6, color: colors.sand, marginTop: 30 }}>
              NOTHING TO SCORE
            </Label>
            <Display style={{ fontSize: 25, color: colors.white, marginTop: 8, textAlign: 'center' }}>
              Not enough to score this one
            </Display>
            <T style={{ fontSize: 14.5, lineHeight: 21, color: colors.sand, marginTop: 12, textAlign: 'center', maxWidth: 300 }}>
              There wasn't quite enough in this session for a fair read — give it another go and speak through a few full answers.
            </T>
            <PrimaryButton
              label="Back to home"
              onPress={() => nav.navigate('Home')}
              style={{ marginTop: 28, alignSelf: 'stretch', minWidth: 240 }}
            />
          </View>
        )}

        {phase === 'demo' && (
          <View style={{ alignItems: 'center' }}>
            <InterviewOrb orbState="idle" size={156} />
            <Label style={{ fontSize: 11, letterSpacing: 1.6, color: colors.persimmonL, marginTop: 30 }}>
              DEMO COMPLETE
            </Label>
            <Display style={{ fontSize: 25, color: colors.white, marginTop: 8, textAlign: 'center' }}>
              That's the demo flow
            </Display>
            <T style={{ fontSize: 14.5, lineHeight: 21, color: colors.sand, marginTop: 12, textAlign: 'center', maxWidth: 300 }}>
              You're in UI-only mode. Connect the backend (and a dev build) to run a real interview and get your scored report.
            </T>
            <PrimaryButton
              label="Back to home"
              onPress={() => nav.navigate('Home')}
              style={{ marginTop: 28, alignSelf: 'stretch', minWidth: 240 }}
            />
          </View>
        )}

        {phase === 'error' && (
          <View style={{ alignItems: 'center' }}>
            <InterviewOrb orbState="interrupted" size={156} />
            <Label style={{ fontSize: 11, letterSpacing: 1.6, color: colors.persimmonL, marginTop: 30 }}>
              SOMETHING WENT WRONG
            </Label>
            <Display style={{ fontSize: 25, color: colors.white, marginTop: 8, textAlign: 'center' }}>
              We couldn't finish scoring
            </Display>
            <T style={{ fontSize: 14.5, lineHeight: 21, color: colors.sand, marginTop: 12, textAlign: 'center', maxWidth: 300 }}>
              Your interview is saved. Head home and you can try again from your history in a moment.
            </T>
            <PrimaryButton
              label="Back to home"
              onPress={() => nav.navigate('Home')}
              style={{ marginTop: 28, alignSelf: 'stretch', minWidth: 240 }}
            />
          </View>
        )}
      </View>
    </Screen>
  );
}
