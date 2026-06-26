import React from 'react';
import { View, Text, Alert, Share } from 'react-native';
import { ScreenScroll, Display, Label, T, Card, IconCircle, BackButton } from '../components/ui';
import { colors, fonts, radius } from '../theme';
import { useNav } from '../navigation';
import { ChevronLeft, Mic, BarChart, Clock, VideoCam, Lock } from '../icons';
import { api, ApiError } from '../api';
import { clearAuth } from '../auth';

// PRIV epics — calm, reassuring transparency about what viva records, how it
// scores, and how to get your data out. Export and deletion call the real
// compliance endpoints (POST /v1/data/export, /v1/data/delete).
export default function DataPrivacyScreen() {
  const nav = useNav();
  const [busy, setBusy] = React.useState<null | 'export' | 'delete'>(null);

  const onExport = () => {
    Alert.alert(
      'Export my data',
      'We’ll gather your account, interviews, transcripts and reports into a file you can save or share.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          onPress: () => {
            if (busy) return;
            setBusy('export');
            (async () => {
              try {
                const data = await api.exportData();
                await Share.share({
                  title: 'viva data export',
                  message: JSON.stringify(data, null, 2),
                });
              } catch (e) {
                Alert.alert('Export failed', e instanceof ApiError ? 'Please sign in and try again.' : 'Check your connection and try again.');
              } finally {
                setBusy(null);
              }
            })();
          },
        },
      ],
    );
  };

  const onDelete = () => {
    Alert.alert(
      'Delete all my data',
      'This permanently removes your account and every interview, transcript and report tied to it. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () => {
            if (busy) return;
            setBusy('delete');
            (async () => {
              try {
                await api.deleteData();
                clearAuth();
                Alert.alert('Account deleted', 'Your data has been permanently removed.');
                nav.reset({ index: 0, routes: [{ name: 'Welcome' }] });
              } catch (e) {
                Alert.alert('Delete failed', e instanceof ApiError ? 'Please sign in and try again.' : 'Check your connection and try again.');
              } finally {
                setBusy(null);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <ScreenScroll
      contentStyle={{ paddingBottom: 36 }}
      footer={null}
    >
      {/* header */}
      <View style={{ paddingHorizontal: 22, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={() => nav.goBack()}>
          <ChevronLeft size={18} color={colors.ink} />
        </BackButton>
        <Display style={{ fontSize: 24 }}>Data &amp; privacy</Display>
      </View>

      <View style={{ paddingHorizontal: 22, paddingTop: 8 }}>
        <T style={{ fontSize: 14, lineHeight: 21, color: colors.muted2 }}>
          You’re in control of what viva keeps. Here’s exactly what we record, how
          scoring works, and how to take your data with you or remove it.
        </T>
      </View>

      {/* YOUR PLAN — entry into the (otherwise orphaned) billing surface */}
      <View style={{ paddingHorizontal: 22, paddingTop: 22 }}>
        <Label style={{ marginBottom: 11 }}>Your plan</Label>
        <Card onPress={() => nav.navigate('Plans')} style={{ padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: fonts.bold, fontSize: 15.5, color: colors.ink }}>Free plan</T>
            <T style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>Upgrade for more interviews and all interviewer styles.</T>
          </View>
          <Text style={{ fontFamily: fonts.bold, fontSize: 13.5, color: colors.persimmonD }}>Upgrade</Text>
        </Card>
      </View>

      {/* WHAT WE RECORD */}
      <View style={{ paddingHorizontal: 22, paddingTop: 24 }}>
        <Label style={{ marginBottom: 11 }}>What we record</Label>
        <Card style={{ padding: 18 }}>
          <Row
            tint={colors.tintCoral}
            icon={<Mic size={20} color={colors.tintCoralText} strokeWidth={2} />}
            title="Audio & transcript"
            body="By default we record your voice and a written transcript of the conversation so we can give you feedback."
          />
          <View style={{ height: 1, backgroundColor: colors.hairline, marginVertical: 15 }} />
          <Row
            tint={colors.tintViolet}
            icon={<VideoCam size={19} color={colors.tintVioletText} strokeWidth={2} />}
            title="Video is off unless you turn it on"
            body="Camera recording is optional. We only capture video when you explicitly enable it for a session."
          />
        </Card>
      </View>

      {/* HOW SCORING WORKS */}
      <View style={{ paddingHorizontal: 22, paddingTop: 22 }}>
        <Label style={{ marginBottom: 11 }}>How scoring works</Label>
        <Card style={{ padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 13 }}>
            <IconCircle bg={colors.tintSand} size={40} br={12}>
              <BarChart size={20} color={colors.tintSandText} strokeWidth={2.4} />
            </IconCircle>
            <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.ink, flex: 1 }}>
              We score what you say, not how you sound
            </Text>
          </View>
          <T style={{ fontSize: 13.5, lineHeight: 20, color: colors.muted2 }}>
            Your feedback is based only on the content of your answers — your reasoning,
            structure and the substance of what you share.
          </T>
          {/* no-affect statement, surfaced verbatim */}
          <View
            style={{
              marginTop: 14,
              backgroundColor: colors.tintSand,
              borderRadius: radius.md,
              padding: 14,
            }}
          >
            <T style={{ fontSize: 13, lineHeight: 19.5, color: '#5a4422', fontFamily: fonts.medium }}>
              viva never scores your tone, accent, or appearance. Two people giving the same
              answer get the same result.
            </T>
          </View>
        </Card>
      </View>

      {/* RETENTION */}
      <View style={{ paddingHorizontal: 22, paddingTop: 22 }}>
        <Label style={{ marginBottom: 11 }}>Retention</Label>
        <Card style={{ padding: 18 }}>
          <Row
            tint={colors.tintViolet}
            icon={<Clock size={18} color={colors.tintVioletText} strokeWidth={2} />}
            title="Kept until you delete it"
            body="Your interviews stay available so you can revisit them and track progress. You can delete any session — or everything — at any time."
          />
        </Card>
      </View>

      {/* ACTIONS */}
      <View style={{ paddingHorizontal: 22, paddingTop: 24, gap: 12 }}>
        <ActionButton
          label="Export my data"
          bg={colors.plum2}
          textColor={colors.white}
          onPress={onExport}
        />
        <ActionButton
          label="Sign out"
          bg={colors.tintSand}
          textColor={colors.ink}
          onPress={() => { clearAuth(); nav.reset({ index: 0, routes: [{ name: 'Welcome' }] }); }}
        />
        <ActionButton
          label="Delete all my data"
          bg={colors.persimmonDeep}
          textColor={colors.white}
          onPress={onDelete}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 4 }}>
          <Lock size={12} color={colors.faint} strokeWidth={1.8} />
          <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.faint }}>
            Encrypted in transit and at rest
          </Text>
        </View>
      </View>
    </ScreenScroll>
  );
}

/* ---------- local pieces ---------- */

function Row({
  tint, icon, title, body,
}: { tint: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <IconCircle bg={tint} size={40} br={12}>
        {icon}
      </IconCircle>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 15.5, color: colors.ink, marginBottom: 4 }}>
          {title}
        </Text>
        <T style={{ fontSize: 13, lineHeight: 19, color: colors.muted2 }}>{body}</T>
      </View>
    </View>
  );
}

function ActionButton({
  label, bg, textColor, onPress,
}: { label: string; bg: string; textColor: string; onPress: () => void }) {
  return (
    <Card
      onPress={onPress}
      style={{
        backgroundColor: bg,
        borderWidth: 0,
        borderRadius: radius.lg,
        paddingVertical: 17,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: textColor }}>{label}</Text>
    </Card>
  );
}
