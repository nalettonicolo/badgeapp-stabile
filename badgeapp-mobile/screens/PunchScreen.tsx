import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
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
  getDistanceMeters,
  getRequiredRadiusByStep,
  isGeofenceConfigured,
  isPointInsidePolygon,
} from '../lib/geofence';
import { fetchWebGeofenceConfig } from '../lib/serverGeofence';
import type { GeofenceConfig } from '../lib/types';
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

const MIN_DWELL_MS = 60 * 60 * 1000;

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
  const [geoConfig, setGeoConfig] = useState<GeofenceConfig | null>(null);
  const [geoOn, setGeoOn] = useState(false);
  const [geoStatus, setGeoStatus] = useState('Geolocalizzazione non attiva.');
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const lastAutoRef = useRef(0);
  const autoBusyRef = useRef(false);
  const insideSinceRef = useRef<number | null>(null);

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

  useEffect(() => {
    void fetchWebGeofenceConfig().then(({ data, error }) => {
      if (error) {
        showToast(`Geofence: ${error.message}`, true);
        return;
      }
      setGeoConfig(data);
    });
  }, []);

  useEffect(() => {
    return () => {
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, []);

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

  async function toggleGeo() {
    if (geoOn) {
      watchRef.current?.remove();
      watchRef.current = null;
      setGeoOn(false);
      insideSinceRef.current = null;
      setGeoStatus('Geolocalizzazione non attiva.');
      return;
    }

    const { data: cfg, error: geofenceError } = await fetchWebGeofenceConfig();
    if (geofenceError) {
      showToast(`Errore geofence web: ${geofenceError.message}`, true);
      return;
    }
    setGeoConfig(cfg);
    if (!cfg || !isGeofenceConfigured(cfg)) {
      showToast(
        'Geofence non configurata sul web. L’admin deve impostare la posizione sede dal portale web.',
        true
      );
      return;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      showToast('Permesso posizione negato.', true);
      return;
    }

    setGeoOn(true);
    insideSinceRef.current = null;
    setGeoStatus('Monitoraggio posizione… permanenza minima richiesta: 60 minuti.');

    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 8000,
        distanceInterval: 8,
      },
      async (loc) => {
        if (!user || autoBusyRef.current) return;
        const idx = nextPunchIndexFromRow(rowRef.current);
        if (idx >= PUNCH_STEPS.length) return;
        if (Date.now() - lastAutoRef.current < 90000) return;

        const { latitude, longitude, accuracy } = loc.coords;
        const { data: g } = await fetchWebGeofenceConfig();
        if (!g || !isGeofenceConfigured(g)) {
          setGeoStatus('Geofence web non configurata.');
          return;
        }
        const distance = getDistanceMeters(latitude, longitude, g.centerLat, g.centerLng);
        const requiredRadius = getRequiredRadiusByStep(idx, g);
        const hasPolygon = Array.isArray(g.polygonPath) && g.polygonPath.length >= 3;
        const insideByRadius = distance <= requiredRadius;
        const insideByPolygon = hasPolygon
          ? isPointInsidePolygon(latitude, longitude, g.polygonPath)
          : false;
        const inside = hasPolygon ? insideByPolygon : insideByRadius;
        const roundedDistance = Math.round(distance);

        if ((accuracy ?? 9999) > g.maxAccuracyMeters) {
          setGeoStatus(
            `Precisione insufficiente (${Math.round(accuracy ?? 0)} m > ${g.maxAccuracyMeters} m).`
          );
          return;
        }

        if (!inside) {
          insideSinceRef.current = null;
          const modeText = hasPolygon
            ? 'area poligonale'
            : `raggio ${Math.round(requiredRadius)} m`;
          setGeoStatus(`Fuori area: ${roundedDistance} m (${modeText}).`);
          return;
        }

        if (!insideSinceRef.current) {
          insideSinceRef.current = Date.now();
          setGeoStatus(
            `Dentro area (${roundedDistance} m). Avvio conteggio permanenza minima 60 minuti.`
          );
          return;
        }
        const dwellMs = Date.now() - insideSinceRef.current;
        if (dwellMs < MIN_DWELL_MS) {
          const remainingMin = Math.ceil((MIN_DWELL_MS - dwellMs) / 60000);
          setGeoStatus(
            `Dentro area (${roundedDistance} m). Timbratura automatica tra ${remainingMin} min.`
          );
          return;
        }

        const s = PUNCH_STEPS[idx];
        const today = getLocalDateString();
        const time = nowHHMM();
        autoBusyRef.current = true;
        const { error } = await upsertPunch(supabase, user, today, s.field, time);
        autoBusyRef.current = false;
        if (error) {
          setGeoStatus(`Errore timbratura: ${error.message}`);
          return;
        }
        lastAutoRef.current = Date.now();
        insideSinceRef.current = Date.now();
        setGeoStatus(`Dentro area (${roundedDistance} m). Timbratura automatica eseguita.`);
        showToast(`Auto: ${s.buttonText} — ${time}`);
        await refresh();
      }
    );

    watchRef.current = sub;
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
          <Text style={styles.heroLabel}>Oggi</Text>
          <Text style={styles.heroDate}>{getLocalDateString()}</Text>
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

            <Text style={styles.sectionTag}>AZIONI</Text>
            <Pressable
              style={({ pressed }) => [styles.outlineBtn, pressed && styles.outlineBtnPressed]}
              onPress={() => setManualOpen(true)}
            >
              <Text style={styles.outlineBtnText}>Timbratura manuale</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.outlineBtn,
                geoOn && styles.outlineBtnGeoOn,
                pressed && styles.outlineBtnPressed,
              ]}
              onPress={() => void toggleGeo()}
            >
              <Text style={[styles.outlineBtnText, geoOn && styles.outlineBtnTextGeoOn]}>
                {geoOn ? 'GPS attivo · tocca per disattivare' : 'Attiva timbratura automatica GPS'}
              </Text>
            </Pressable>
            <View style={styles.geoBox}>
              <Text style={styles.geo}>{geoStatus}</Text>
            </View>

            <View style={styles.callout}>
              <Text style={styles.calloutText}>
                Attiva il GPS su questo dispositivo per l’auto-timbratura. Serve permanenza minima di
                60 minuti nell’area sede.
              </Text>
            </View>

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

            {geoConfig && !isGeofenceConfigured(geoConfig) ? (
              <View style={styles.warnBox}>
                <Text style={styles.warnText}>
                  Geofence non configurata sul server. Contatta un amministratore.
                </Text>
              </View>
            ) : null}
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
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  heroLabel: { ...typography.section, marginBottom: 4 },
  heroDate: { fontSize: 26, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
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
  outlineBtnGeoOn: {
    borderColor: colors.geo,
    backgroundColor: colors.geoMuted,
  },
  outlineBtnText: { fontSize: 15, fontWeight: '600', color: colors.primary, textAlign: 'center' },
  outlineBtnTextGeoOn: { color: colors.geo },
  geoBox: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  geo: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  callout: {
    backgroundColor: colors.warningBg,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  calloutText: { fontSize: 12, color: colors.warning, lineHeight: 18, fontWeight: '500' },
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
  warnBox: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerMuted,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  warnText: { color: colors.danger, fontSize: 13, lineHeight: 18 },
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
