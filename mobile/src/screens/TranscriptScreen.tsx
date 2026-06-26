import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { ScreenScroll, Display, T, Card, BackButton } from '../components/ui';
import { ChevronLeft } from '../icons';
import { colors, fonts, radius } from '../theme';
import { useNav, useRouteParams } from '../navigation';
import { api, ApiError, type TranscriptTurn } from '../api';

export default function TranscriptScreen() {
  const nav = useNav();
  const { sessionId } = useRouteParams<'Transcript'>();

  const [turns, setTurns] = useState<TranscriptTurn[] | null>(null);
  const [speaker, setSpeaker] = useState('INTERVIEWER');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const names: Record<string, string> = { aria: 'ARIA', sam: 'SAM', lena: 'LENA' };
    api.getSession(sessionId).then((d) => { if (alive && d.persona) setSpeaker(names[d.persona] ?? 'INTERVIEWER'); }).catch(() => {});
    (async () => {
      try {
        const res = await api.getTranscript(sessionId);
        if (alive) setTurns(res.turns);
      } catch (e) {
        if (alive) {
          const msg =
            e instanceof ApiError
              ? 'We could not load this transcript.'
              : 'Something went wrong loading the transcript.';
          setError(msg);
          setTurns([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [sessionId]);

  const header = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 22,
        paddingTop: 10,
        paddingBottom: 18,
      }}
    >
      <BackButton onPress={() => nav.goBack()}>
        <ChevronLeft />
      </BackButton>
      <Display style={{ fontSize: 24 }}>Transcript</Display>
    </View>
  );

  const loading = turns === null;
  const empty = !loading && turns!.length === 0;

  return (
    <ScreenScroll contentStyle={{ paddingBottom: 32 }}>
      {header}

      {loading && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
          <ActivityIndicator color={colors.persimmon} />
          <T style={{ marginTop: 14, fontSize: 13.5, color: colors.muted }}>Loading transcript…</T>
        </View>
      )}

      {empty && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 40 }}>
          <Display style={{ fontSize: 18, color: colors.muted2, textAlign: 'center' }}>
            {error ?? 'No transcript yet'}
          </Display>
          {!error && (
            <T style={{ marginTop: 8, fontSize: 13.5, color: colors.muted, textAlign: 'center', lineHeight: 19 }}>
              This session has no recorded turns.
            </T>
          )}
        </View>
      )}

      {!loading && !empty && (
        <View style={{ paddingHorizontal: 22, gap: 14 }}>
          {turns!.map((turn, i) => (
            <Card key={turn.questionId ?? i} style={{ padding: 16, borderRadius: radius.xl }}>
              {/* interviewer line */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                <View
                  style={{
                    backgroundColor: colors.tintViolet,
                    borderRadius: radius.pill,
                    paddingHorizontal: 9,
                    paddingVertical: 3,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: fonts.bold,
                      fontSize: 10.5,
                      letterSpacing: 0.9,
                      color: colors.tintVioletText,
                    }}
                  >
                    {speaker}
                  </Text>
                </View>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 11.5, color: colors.faint }}>
                  {`Question ${i + 1}`}
                </Text>
              </View>
              <T style={{ fontSize: 15, lineHeight: 21, color: colors.ink }}>{turn.interviewerText}</T>

              {/* candidate answer */}
              <View
                style={{
                  marginTop: 14,
                  paddingTop: 14,
                  borderTopWidth: 1,
                  borderTopColor: colors.hairline,
                }}
              >
                <View style={{ marginBottom: 8 }}>
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      backgroundColor: colors.tintCoral,
                      borderRadius: radius.pill,
                      paddingHorizontal: 9,
                      paddingVertical: 3,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: fonts.bold,
                        fontSize: 10.5,
                        letterSpacing: 0.9,
                        color: colors.tintCoralText,
                      }}
                    >
                      YOU
                    </Text>
                  </View>
                </View>
                {turn.candidateText ? (
                  <T style={{ fontSize: 14, lineHeight: 20, color: colors.muted2 }}>{turn.candidateText}</T>
                ) : (
                  <T style={{ fontSize: 13.5, lineHeight: 20, color: colors.faint, fontStyle: 'italic' }}>
                    No answer recorded.
                  </T>
                )}
              </View>
            </Card>
          ))}
        </View>
      )}
    </ScreenScroll>
  );
}
