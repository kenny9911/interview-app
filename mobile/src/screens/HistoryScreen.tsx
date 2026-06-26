import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { ScreenScroll, Display, T, Card, IconCircle, PrimaryButton, BackButton } from '../components/ui';
import { colors, fonts, radius } from '../theme';
import { useNav } from '../navigation';
import { ChevronLeft, Calendar } from '../icons';
import { api, ApiError, type SessionSummary, type Mode } from '../api';

const MODE_LABELS: Record<Mode, string> = {
  mock: 'Mock interview',
  topic_practice: 'Topic practice',
  capability_assessment: 'Capability assessment',
  real: 'Real interview',
  expert_interview: 'Expert interview',
};

function humanizeMode(mode: Mode): string {
  return MODE_LABELS[mode] ?? mode;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function HistoryScreen() {
  const nav = useNav();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [sessions, setSessions] = React.useState<SessionSummary[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { sessions: list } = await api.listSessions();
      setSessions(list);
    } catch (e) {
      const msg = e instanceof ApiError ? `Couldn't load your interviews (${e.status}).` : "Couldn't load your interviews.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <ScreenScroll>
      {/* header */}
      <View style={{ paddingHorizontal: 22, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <BackButton onPress={() => nav.navigate('Home')}>
          <ChevronLeft size={18} color={colors.ink} />
        </BackButton>
      </View>

      {/* title */}
      <View style={{ paddingHorizontal: 22, paddingTop: 22, paddingBottom: 8 }}>
        <Display style={{ fontSize: 28, lineHeight: 31, letterSpacing: -0.28 }}>Your interviews</Display>
      </View>

      {loading && (
        <View style={{ paddingTop: 64, alignItems: 'center' }}>
          <ActivityIndicator color={colors.persimmon} />
        </View>
      )}

      {!loading && error && (
        <View style={{ paddingHorizontal: 22, paddingTop: 40, alignItems: 'center' }}>
          <T style={{ fontSize: 14, color: colors.muted2, textAlign: 'center', marginBottom: 18 }}>{error}</T>
          <PrimaryButton label="Try again" onPress={load} />
        </View>
      )}

      {!loading && !error && sessions.length === 0 && (
        <View style={{ paddingHorizontal: 22, paddingTop: 56, alignItems: 'center' }}>
          <IconCircle bg={colors.tintSand} size={64} br={20}>
            <Calendar size={28} color={colors.tintSandText} />
          </IconCircle>
          <Display style={{ fontSize: 18, marginTop: 18, textAlign: 'center' }}>No interviews yet</Display>
          <T style={{ fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: 'center', marginTop: 6, marginBottom: 22 }}>
            Start your first one and it'll show up here.
          </T>
          <PrimaryButton label="Start an interview" onPress={() => nav.navigate('ChooseMode')} />
        </View>
      )}

      {!loading && !error && sessions.length > 0 && (
        <View style={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 8, gap: 12 }}>
          {sessions.map((s) => (
            <SessionRow
              key={s.sessionId}
              session={s}
              // complete → report; in-progress → resume the live interview.
              onPress={() => s.status === 'complete'
                ? nav.navigate('Results', { sessionId: s.sessionId })
                : nav.navigate('Live', { sessionId: s.sessionId })}
            />
          ))}
        </View>
      )}
    </ScreenScroll>
  );
}

function SessionRow({ session, onPress }: { session: SessionSummary; onPress?: () => void }) {
  const complete = session.status === 'complete';
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={complete
        ? `${session.role}, view results`
        : `${session.role}, in progress — tap to resume`}
      style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}
    >
      <IconCircle bg={colors.tintViolet} size={46} br={13}>
        <Calendar size={22} color={colors.tintVioletText} />
      </IconCircle>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.ink }} numberOfLines={1}>
          {session.role}
        </Text>
        <Text style={{ fontFamily: fonts.text, fontSize: 12.5, color: colors.muted, marginTop: 3 }}>
          {humanizeMode(session.mode)}
          {formatDate(session.createdAt) ? ` · ${formatDate(session.createdAt)}` : ''}
        </Text>
      </View>
      {complete ? (
        <ScoreChip score={session.overallScore} />
      ) : (
        // in-progress rows are now tappable to resume — label reads as an action.
        <View style={{ backgroundColor: colors.tintCoral, paddingVertical: 5, paddingHorizontal: 11, borderRadius: radius.pill }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.3, color: colors.tintCoralText }}>Resume</Text>
        </View>
      )}
    </Card>
  );
}

function ScoreChip({ score }: { score?: number }) {
  const value = typeof score === 'number' ? String(Math.round(score)) : '—';
  return (
    <View
      style={{
        minWidth: 46,
        height: 46,
        borderRadius: 13,
        backgroundColor: colors.tintCoral,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
      }}
    >
      <Text style={{ fontFamily: fonts.display, fontSize: 19, color: colors.tintCoralText }}>{value}</Text>
    </View>
  );
}
