import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { base, colors, radius, shadow, space, typography } from '../lib/theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    const { error: e } = await signIn(email.trim(), password);
    setBusy(false);
    if (e) setError(e.message);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.outer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.brand}>
          <View style={styles.logoMark} />
          <Text style={styles.brandTitle}>BadgeApp</Text>
          <Text style={styles.brandSub}>Timbrature e presenze</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Accedi</Text>
          <Text style={styles.cardHint}>Stesse credenziali del portale web aziendale.</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="nome@azienda.it"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
          />

          {error ? (
            <View style={styles.errBox}>
              <Text style={styles.err}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.btn,
              busy && styles.btnDisabled,
              pressed && !busy && styles.btnPressed,
            ]}
            onPress={onSubmit}
            disabled={busy}
            android_ripple={{ color: '#ffffff33' }}
          >
            {busy ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.btnText}>Entra</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  outer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    paddingBottom: space.xxl,
  },
  brand: { alignItems: 'center', marginBottom: space.xxl },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    marginBottom: space.md,
    ...shadow.card,
  },
  brandTitle: {
    ...typography.hero,
    fontSize: 26,
  },
  brandSub: { ...typography.subtitle, marginTop: space.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  cardTitle: { ...typography.title, marginBottom: space.xs },
  cardHint: { ...typography.caption, marginBottom: space.lg, lineHeight: 20 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: space.sm,
  },
  input: {
    ...base.input,
    marginBottom: space.md,
  },
  errBox: {
    backgroundColor: colors.dangerMuted,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  err: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: space.lg,
    alignItems: 'center',
    marginTop: space.sm,
    ...shadow.sm,
  },
  btnPressed: { backgroundColor: colors.primaryPressed },
  btnDisabled: { opacity: 0.65 },
  btnText: { color: colors.onPrimary, fontSize: 17, fontWeight: '700' },
});
