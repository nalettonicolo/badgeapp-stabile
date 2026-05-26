import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import {
  getLocalDateString,
  loadTodayPunches,
  nextPunchIndexFromRow,
  PUNCH_STEPS,
  upsertPunch,
} from '../lib/punch';
import { supabase } from '../lib/supabase';
import type { DailyPunchRow } from '../lib/types';
import { base, colors, layout, radius, shadow, space, typography } from '../lib/theme';
import type { RootStackParamList } from '../App';

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function PunchScreen() {
  const { user, signOut, isAdmin } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Punch'>>();
  const [row, setRow] = useState<Partial<DailyPunchRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualField, setManualField] = useState<(typeof PUNCH_STEPS)[number]['field']>('iniziomattina');
  const [manualDate, setManualDate] = useState(getLocalDateString());
  const [manualTime, setManualTime] = useState('');

  const rowRef = useRef(row);
  useEffect(() => {
    rowRef.current = row;
  }, [row]);

  const nextIndex = nextPunchIndexFromRow(row);
  const step = nextIndex < PUNCH_STEPS.length ? PUNCH_STEPS[nextIndex] : null;

  const showToast = useCallback((text: string, error = false) => {
    setToast({ text, error });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await loadTodayPunches(supabase, user.id);
    setLoading(false);
    if (error) {
      showToast(error.message, true);
      return;
    }
    setRow(data);
  }, [user, showToast]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  async function onPunch() {
    if (!user || !step || punching) return;
    setPunching(true);
    const today = getLocalDateString();
    const time = nowHHMM();
    const { error } = await upsertPunch(supabase, user, today, step.field, time);
    setPunching(false);
    if (error) {
      showToast(error.message, true);
      return;
    }
    showToast(`Registrato: ${step.buttonText} — ${time}`);
    await refresh();
  }

  async function onManualSave() {
    if (!user) return;
    const t = manualTime.trim();
    if (!manualDate || !t || !/^\d{2}:\d{2}$/.test(t)) {
      showToast('Compila data e ora (HH:MM).', true);
      return;
    }
    setManualOpen(false);
    setPunching(true);
    const { error } = await upsertPunch(supabase, user, manualDate, manualField, t);
    setPunching(false);
    if (error) {
      showToast(error.message, true);
      return;
    }
    showToast(`Timbratura manuale salvata (${manualField})`);
    if (manualDate === getLocalDateString()) await refresh();
  }

  const breakLabel =
    row?.finemattina && row?.iniziopomeriggio
      ? `${Math.max(0, (() => {
          const [h1, m1] = row.finemattina!.split(':').map(Number);
          const [h2, m2] = row.iniziopomeriggio!.split(':').map(Number);
          return h2 * 60 + m2 - (h1 * 60 + m1);
        })())} min`
      : 'N/A';

  if (!user) return null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.h1}>Timbrature</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {user.email}
          </Text>
        </View>
        <Pressable
          onPress={() => signOut()}
          style={({ pressed }) => [styles.outBtn, pressed && styles.outBtnPressed]}
          hitSlop={8}
        >
          <Text style={styles.outBtnText}>Esci</Text>
        </Pressable>
      </View>

      {toast ? (
        <View style={[layout.toastOk, toast.error && layout.toastErr]}>
          <Text style={layout.toastText}>{toast.text}</Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>Oggi</Text>
              <Text style={styles.heroDate}>{getLocalDateString()}</Text>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{step ? 'In corso' : 'Completata'}</Text>
            </View>
          </View>
          <Text style={styles.heroSub}>
            Timbrature registrate senza accesso alla posizione del dispositivo.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        ) : (
          <>
            <View style={styles.groupCard}>
              <Text style={styles.sectionTag}>GIORNATA</Text>
              {PUNCH_STEPS.map((s) => (
                <View key={s.field} style={styles.punchRow}>
                  <Text style={styles.punchLabel}>{s.buttonText}</Text>
                  <Text style={styles.punchVal}>{row?.[s.field] || '—'}</Text>
                </View>
              ))}
              <View style={[styles.punchRow, styles.punchRowLast]}>
                <Text style={styles.punchLabel}>Pausa pranzo</Text>
                <Text style={styles.punchVal}>{breakLabel}</Text>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.primary,
                (!step || punching) && styles.primaryDisabled,
                pressed && step && !punching && styles.primaryPressed,
              ]}
              onPress={onPunch}
              disabled={!step || punching}
              android_ripple={{ color: '#ffffff44' }}
            >
              {punching ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.primaryText}>
                  {step ? step.buttonText : 'Giornata completata'}
                </Text>
              )}
            </Pressable>

            <Text style={styles.hint}>
              {step
                ? `Prossima operazione: ${step.buttonText.toLowerCase()}`
                : 'Hai completato tutte le timbrature previste per oggi.'}
            </Text>

            <View style={styles.actionCard}>
              <Text style={styles.sectionTag}>AZIONI</Text>
              <Pressable
                style={({ pressed }) => [styles.outlineBtn, pressed && styles.outlineBtnPressed]}
                onPress={() => setManualOpen(true)}
              >
                <Text style={styles.outlineBtnText}>Timbratura manuale</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.outlineBtn, pressed && styles.outlineBtnPressed]}
                onPress={() => navigation.navigate('Requests')}
              >
                <Text style={styles.outlineBtnText}>Malattia, trasferta e ferie</Text>
              </Pressable>

              {isAdmin ? (
                <Pressable
                  style={({ pressed }) => [styles.adminBtn, pressed && styles.adminBtnPressed]}
                  onPress={() => navigation.navigate('Admin')}
                >
                  <Text style={styles.adminBtnText}>Area amministrazione</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={manualOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Timbratura manuale</Text>
            <Text style={styles.modalWarn}>
              Sovrascrive il campo selezionato per la data indicata.
            </Text>

            <Text style={styles.label}>Tipo</Text>
            <View style={styles.pickerRow}>
              {PUNCH_STEPS.map((s) => (
                <Pressable
                  key={s.field}
                  style={[styles.chip, manualField === s.field && styles.chipOn]}
                  onPress={() => setManualField(s.field)}
                >
                  <Text style={[styles.chipText, manualField === s.field && styles.chipTextOn]}>
                    {s.buttonText}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Data (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={manualDate}
              onChangeText={setManualDate}
              placeholder="2026-03-31"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Ora (HH:MM)</Text>
            <TextInput
              style={styles.input}
              value={manualTime}
              onChangeText={setManualTime}
              placeholder="09:00"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setManualOpen(false)}>
                <Text style={styles.cancelBtnText}>Annulla</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={() => void onManualSave()}>
                <Text style={styles.saveBtnText}>Salva</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    ...layout.headerRow,
    paddingTop: space.sm,
  },
  headerText: { flex: 1, marginRight: space.sm },
  h1: { ...typography.title },
  headerSub: { ...typography.caption, marginTop: 2, color: colors.textSecondary },
  outBtn: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
  },
  outBtnPressed: { opacity: 0.85 },
  outBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  scroll: { paddingHorizontal: space.lg, paddingBottom: 48 },
  loader: { marginVertical: space.xxl },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  heroLabel: { ...typography.section, marginBottom: 4 },
  heroDate: { fontSize: 26, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
  heroSub: { ...typography.caption, marginTop: space.md, lineHeight: 19 },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  statusPillText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  sectionTag: {
    ...typography.section,
    marginBottom: space.md,
  },
  punchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: space.md,
  },
  punchRowLast: { borderBottomWidth: 0 },
  punchLabel: { flex: 1, fontSize: 13, color: colors.textSecondary, fontWeight: '500', lineHeight: 18 },
  punchVal: { fontSize: 17, fontWeight: '700', color: colors.text, minWidth: 72, textAlign: 'right' },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: space.lg,
    alignItems: 'center',
    ...shadow.sm,
  },
  primaryPressed: { backgroundColor: colors.primaryPressed },
  primaryDisabled: { backgroundColor: colors.textMuted, opacity: 0.5 },
  primaryText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
  hint: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: space.md,
    marginBottom: space.lg,
    lineHeight: 20,
  },
  actionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
    ...shadow.sm,
  },
  outlineBtnPressed: { backgroundColor: colors.surface2 },
  outlineBtnText: { fontSize: 15, fontWeight: '600', color: colors.primary, textAlign: 'center' },
  adminBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    alignItems: 'center',
    marginTop: space.sm,
    ...shadow.sm,
  },
  adminBtnPressed: { backgroundColor: colors.primaryPressed },
  adminBtnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 15 },
  modalBg: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: space.lg,
  },
  modalBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.xl,
    ...shadow.card,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: space.sm, color: colors.success },
  modalWarn: { fontSize: 13, color: colors.danger, marginBottom: space.lg, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: space.sm },
  input: {
    ...base.input,
    marginBottom: space.md,
  },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  chipText: { fontSize: 12, color: colors.textSecondary },
  chipTextOn: { color: colors.primary, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  cancelBtn: {
    flex: 1,
    paddingVertical: space.md,
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.textMuted,
  },
  cancelBtnText: { color: colors.onPrimary, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    paddingVertical: space.md,
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.success,
  },
  saveBtnText: { color: colors.onPrimary, fontWeight: '700' },
});
