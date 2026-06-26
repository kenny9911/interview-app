import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { ScreenScroll, Display, T, PrimaryButton, BackButton, Divider } from '../components/ui';
import { colors, fonts, radius } from '../theme';
import { ChevronLeft, Eye, GoogleG, AppleLogo } from '../icons';
import { useNav } from '../navigation';
import { api, ApiError } from '../api';
import { setAuth } from '../auth';

export default function SignInScreen() {
  const nav = useNav();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /\S+@\S+\.\S+/.test(email);

  async function signIn() {
    if (loading) return;
    setError(null);
    if (!emailValid) { setError('Enter a valid email address.'); return; }
    if (password.length < 8) { setError('Enter your password (at least 8 characters).'); return; }
    setLoading(true);
    try {
      const { token, userId } = await api.signin(email.trim(), password);
      setAuth(token, userId);
      nav.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 401
        ? 'Email or password is incorrect.'
        : e instanceof ApiError ? 'Sign in failed. Please try again.' : 'Check your connection and try again.';
      setError(msg);
      setLoading(false);
    }
  }

  // Social sign-in isn't wired yet — be honest rather than faking a login.
  const oauth = (_provider: string) =>
    setError('Apple & Google sign-in are coming soon — please use your email and password for now.');

  return (
    <ScreenScroll
      footer={
        <View style={{ paddingHorizontal: 26, paddingBottom: 14, paddingTop: 10, alignItems: 'center' }}>
          <Text style={{ fontFamily: fonts.text, fontSize: 14.5, color: colors.muted }}>
            New here?{' '}
            <Text
              style={{ fontFamily: fonts.bold, color: colors.persimmonD }}
              onPress={() => nav.navigate('SignUp')}
              accessibilityRole="button"
              accessibilityLabel="Create account"
            >
              Create account
            </Text>
          </Text>
        </View>
      }
    >
      <View style={{ paddingHorizontal: 26, paddingTop: 10 }}>
        <BackButton onPress={() => nav.navigate('Welcome')}>
          <ChevronLeft size={18} color={colors.ink} />
        </BackButton>
      </View>

      <View style={{ paddingHorizontal: 26, paddingTop: 26 }}>
        <Display style={{ fontSize: 30, lineHeight: 33, letterSpacing: -0.3 }}>Welcome back</Display>
        <T style={{ fontSize: 15, color: colors.muted, marginTop: 6 }}>Sign in to continue your prep.</T>
      </View>

      <View style={{ paddingHorizontal: 26, paddingTop: 26, gap: 13 }}>
        <View>
          <Text style={{ fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.96, color: colors.muted, marginBottom: 8 }}>EMAIL</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@email.com"
            placeholderTextColor={colors.faint}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            accessibilityLabel="Email"
            style={[fieldStyle, { fontFamily: fonts.text, fontSize: 15, color: colors.ink }]}
          />
        </View>

        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.96, color: colors.muted }}>PASSWORD</Text>
            <Pressable
              onPress={() => setError('Password reset is coming soon — please contact support if you’re locked out.')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Forgot password"
            >
              <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.persimmonD }}>Forgot?</Text>
            </Pressable>
          </View>
          <View style={[fieldStyle, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 0 }]}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.faint}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              accessibilityLabel="Password"
              style={{ flex: 1, fontFamily: fonts.text, fontSize: 15, color: colors.ink, paddingVertical: 15 }}
            />
            <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={8} accessibilityRole="button" accessibilityLabel={showPw ? 'Hide password' : 'Show password'}>
              <Eye size={19} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        {error ? <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.persimmonD }}>{error}</Text> : null}

        <PrimaryButton
          label={loading ? 'Signing in…' : 'Sign in'}
          fontSize={16}
          padding={16}
          rightIcon={loading ? <ActivityIndicator color={colors.white} /> : undefined}
          style={{ marginTop: 4, opacity: emailValid ? 1 : 0.6 }}
          onPress={() => signIn()}
        />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 26, paddingTop: 24 }}>
        <Divider color={colors.hairline2} style={{ flex: 1 }} />
        <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: colors.faint }}>or continue with</Text>
        <Divider color={colors.hairline2} style={{ flex: 1 }} />
      </View>

      <View style={{ paddingHorizontal: 26, paddingTop: 18, gap: 11 }}>
        <Pressable onPress={() => oauth('google')} style={({ pressed }) => [socialBase, { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.hairline, gap: 10, opacity: pressed ? 0.92 : 1 }]}>
          <GoogleG size={19} />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>Continue with Google</Text>
        </Pressable>
        <Pressable onPress={() => oauth('apple')} style={({ pressed }) => [socialBase, { backgroundColor: colors.ink, gap: 9, opacity: pressed ? 0.92 : 1 }]}>
          <AppleLogo size={18} color="#fff" />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.white }}>Continue with Apple</Text>
        </Pressable>
      </View>
    </ScreenScroll>
  );
}

const fieldStyle = {
  backgroundColor: colors.white,
  borderWidth: 1,
  borderColor: colors.hairline,
  borderRadius: radius.md,
  paddingVertical: 15,
  paddingHorizontal: 16,
} as const;

const socialBase = {
  borderRadius: radius.md,
  paddingVertical: 14,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
