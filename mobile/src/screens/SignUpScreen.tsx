import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Linking } from 'react-native';
import { ScreenScroll, Display, BackButton, T, PrimaryButton, Divider } from '../components/ui';
import { ChevronLeft, Eye, GoogleG, AppleLogo } from '../icons';
import { colors, fonts, radius } from '../theme';
import { useNav } from '../navigation';
import { api, ApiError } from '../api';
import { setAuth } from '../auth';

// Placeholder destinations — the owner will host the real pages.
const TERMS_URL = 'https://viva.app/terms';
const PRIVACY_URL = 'https://viva.app/privacy';

function Field({ label, value, onChangeText, placeholder, secure, trailing, keyboardType, autoComplete }: {
  label: string; value: string; onChangeText: (t: string) => void; placeholder: string;
  secure?: boolean; trailing?: React.ReactNode; keyboardType?: 'email-address' | 'default'; autoComplete?: 'email' | 'name' | 'password-new';
}) {
  return (
    <View>
      <Text style={{ fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.96, color: colors.muted, marginBottom: 8 }}>{label}</Text>
      <View style={{ backgroundColor: colors.white, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.md, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          secureTextEntry={secure}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
          keyboardType={keyboardType ?? 'default'}
          autoComplete={autoComplete}
          accessibilityLabel={label}
          style={{ flex: 1, fontFamily: fonts.text, fontSize: 15, color: colors.ink, paddingVertical: 15 }}
        />
        {trailing}
      </View>
    </View>
  );
}

export default function SignUpScreen() {
  const nav = useNav();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /\S+@\S+\.\S+/.test(email);
  // simple strength meter from password length/variety
  const pwScore = Math.min(4, (password.length >= 8 ? 1 : 0) + (/[A-Z]/.test(password) ? 1 : 0) + (/[0-9]/.test(password) ? 1 : 0) + (/[^A-Za-z0-9]/.test(password) ? 1 : 0));
  const strength = [0, 1, 2, 3].map((i) => (i < pwScore ? (pwScore >= 3 ? colors.persimmon : colors.sand) : colors.hairline2));

  async function create() {
    if (loading) return;
    setError(null);
    if (!emailValid) { setError('Enter a valid email address.'); return; }
    if (password.length < 8) { setError('Choose a password with at least 8 characters.'); return; }
    setLoading(true);
    try {
      const { token, userId } = await api.signup(email.trim(), password);
      setAuth(token, userId);
      nav.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 409
        ? 'That email already has an account — try signing in.'
        : e instanceof ApiError ? 'Could not create your account. Please try again.' : 'Check your connection and try again.';
      setError(msg);
      setLoading(false);
    }
  }

  // Social sign-up isn't wired yet — be honest rather than faking an account.
  const oauth = (_provider: string) =>
    setError('Apple & Google sign-up are coming soon — please use your email and password for now.');

  return (
    <ScreenScroll
      contentStyle={{ paddingTop: 10, paddingHorizontal: 26, paddingBottom: 8 }}
      footer={
        <View style={{ paddingHorizontal: 26, paddingBottom: 8, paddingTop: 14 }}>
          <Text style={{ textAlign: 'center', fontSize: 12.5, lineHeight: 19, color: colors.faint, fontFamily: fonts.text }}>
            By continuing you agree to our{'\n'}
            <Text
              style={{ color: colors.muted, fontFamily: fonts.bold }}
              onPress={() => Linking.openURL(TERMS_URL)}
              accessibilityRole="link"
              accessibilityLabel="Terms"
            >
              Terms
            </Text>
            <Text> &amp; </Text>
            <Text
              style={{ color: colors.muted, fontFamily: fonts.bold }}
              onPress={() => Linking.openURL(PRIVACY_URL)}
              accessibilityRole="link"
              accessibilityLabel="Privacy Policy"
            >
              Privacy Policy
            </Text>
          </Text>
        </View>
      }
    >
      <BackButton onPress={() => nav.navigate('Welcome')}>
        <ChevronLeft size={18} color={colors.ink} />
      </BackButton>

      <View style={{ marginTop: 26 }}>
        <Display style={{ fontSize: 30, lineHeight: 33, letterSpacing: -0.3 }}>Create your{'\n'}account</Display>
        <T style={{ fontSize: 15, color: colors.muted, marginTop: 6 }}>Free to start — no card needed.</T>
      </View>

      <View style={{ marginTop: 24, gap: 13 }}>
        <Field label="FULL NAME" value={name} onChangeText={setName} placeholder="Your name" autoComplete="name" />
        <Field label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@email.com" keyboardType="email-address" autoComplete="email" />
        <View>
          <Field label="PASSWORD" value={password} onChangeText={setPassword} placeholder="••••••••" secure={!showPw} autoComplete="password-new"
            trailing={<Pressable onPress={() => setShowPw((v) => !v)} hitSlop={8} accessibilityRole="button" accessibilityLabel={showPw ? 'Hide password' : 'Show password'}><Eye size={19} color={colors.muted} /></Pressable>} />
          <View style={{ flexDirection: 'row', gap: 5, marginTop: 9 }}>
            {strength.map((c, i) => (
              <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: c }} />
            ))}
          </View>
        </View>

        {error ? <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.persimmonD }}>{error}</Text> : null}

        <PrimaryButton
          label={loading ? 'Creating…' : 'Create account'}
          fontSize={16}
          padding={16}
          rightIcon={loading ? <ActivityIndicator color={colors.white} /> : undefined}
          style={{ borderRadius: radius.lg, marginTop: 4, opacity: emailValid ? 1 : 0.6 }}
          onPress={() => create()}
        />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22 }}>
        <Divider style={{ flex: 1 }} />
        <Text style={{ fontSize: 12.5, color: colors.faint, fontFamily: fonts.semibold }}>or sign up with</Text>
        <Divider style={{ flex: 1 }} />
      </View>

      <View style={{ flexDirection: 'row', gap: 11, marginTop: 16 }}>
        <Pressable onPress={() => oauth('google')} style={({ pressed }) => ({ flex: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.md, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.92 : 1 })}>
          <GoogleG size={18} />
          <Text style={{ fontSize: 14.5, fontFamily: fonts.semibold, color: colors.ink }}>Google</Text>
        </Pressable>
        <Pressable onPress={() => oauth('apple')} style={({ pressed }) => ({ flex: 1, backgroundColor: colors.ink, borderRadius: radius.md, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.92 : 1 })}>
          <AppleLogo size={17} color={colors.white} />
          <Text style={{ fontSize: 14.5, fontFamily: fonts.semibold, color: colors.white }}>Apple</Text>
        </Pressable>
      </View>
    </ScreenScroll>
  );
}
