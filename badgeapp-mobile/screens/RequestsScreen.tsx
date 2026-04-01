import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../App';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { base, colors, layout, radius, shadow, space, typography } from '../lib/theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Requests'>;

type RequestType = 'trasferta' | 'malattia' | 'ferie';
type TrasfertaScope = 'TI' | 'TE';

type RequestRow = {
  id: string;
  user_id: string;
  request_type: string;
  start_date: string;
  end_date: string;
  note: string | null;
  travel_hours: number | null;
  total_hours_declared: number | null;
  trasferta_scope: TrasfertaScope | null;
  status: string | null;
  created_at: string;
};

function parseHours(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

export default function RequestsScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const [type, setType] = useState<RequestType>('trasferta');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [travelHours, setTravelHours] = useState('');
  const [totalHoursDeclared, setTotalHoursDeclared] = useState('');
  const [trasfertaScope, setTrasfertaScope] = useState<TrasfertaScope | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<RequestRow[]>([]);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);

  const showToast = useCallback((text: string, error = false) => {
    setToast({ text, error });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadItems = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('employee_requests')
      .select(
        'id,user_id,request_type,start_date,end_date,note,travel_hours,total_hours_declared,trasferta_scope,status,created_at'
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      showToast(error.message, true);
      return;
    }
    setItems((data ?? []) as RequestRow[]);
  }, [showToast, user]);

  useFocusEffect(
    useCallback(() => {
      void loadItems();
    }, [loadItems])
  );

  async function saveRecord() {
    if (!user) return;
    const sd = startDate.trim();
    const ed = endDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sd) || !/^\d{4}-\d{2}-\d{2}$/.test(ed)) {
      showToast('Inserisci date nel formato YYYY-MM-DD.', true);
      return;
    }

    let travel: number | null = null;
    let totalDeclared: number | null = null;
    if (type === 'trasferta') {
      travel = parseHours(travelHours);
      totalDeclared = parseHours(totalHoursDeclared);
      if (travelHours.trim() !== '' && travel === null) {
        showToast('Ore di viaggio: inserisci un numero valido (es. 2 o 2,5).', true);
        return;
      }
      if (totalHoursDeclared.trim() !== '' && totalDeclared === null) {
        showToast('Ore totali dichiarate: inserisci un numero valido.', true);
        return;
      }
      if (!trasfertaScope) {
        showToast('Seleziona TI (Italia) o TE (estera) accanto alle ore totali.', true);
        return;
      }
    }

    setSaving(true);
    const { error } = await supabase.from('employee_requests').insert({
      user_id: user.id,
      request_type: type,
      start_date: sd,
      end_date: ed,
      note: note.trim() || null,
      travel_hours: type === 'trasferta' ? travel : null,
      total_hours_declared: type === 'trasferta' ? totalDeclared : null,
      trasferta_scope: type === 'trasferta' ? trasfertaScope : null,
      status: 'saved',
    });
    setSaving(false);
    if (error) {
      showToast(error.message, true);
      return;
    }
    setStartDate('');
    setEndDate('');
    setTravelHours('');
    setTotalHoursDeclared('');
    setTrasfertaScope(null);
    setNote('');
    showToast('Salvato.');
    await loadItems();
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Trasferte, malattie e ferie</Text>
          <Text style={styles.headerSub}>Salvataggio locale su database aziendale</Text>
        </View>
        <Pressable style={styles.closePill} onPress={() => navigation.goBack()}>
          <Text style={styles.closePillText}>Chiudi</Text>
        </Pressable>
      </View>

      {toast ? (
        <View style={[layout.toastOk, toast.error && layout.toastErr]}>
          <Text style={layout.toastText}>{toast.text}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Registra trasferta, malattia o ferie: i dati sono per monitoraggio interno.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTag}>NUOVO</Text>
          <Text style={styles.cardTitle}>Periodo</Text>
          <View style={styles.row}>
            <Pressable
              style={[styles.chip, type === 'trasferta' && styles.chipOn]}
              onPress={() => {
                setType('trasferta');
              }}
            >
              <Text style={[styles.chipText, type === 'trasferta' && styles.chipTextOn]}>
                Trasferta
              </Text>
            </Pressable>
            <Pressable
              style={[styles.chip, type === 'malattia' && styles.chipOn]}
              onPress={() => {
                setType('malattia');
                setTrasfertaScope(null);
              }}
            >
              <Text style={[styles.chipText, type === 'malattia' && styles.chipTextOn]}>
                Malattia
              </Text>
            </Pressable>
            <Pressable
              style={[styles.chip, type === 'ferie' && styles.chipOn]}
              onPress={() => {
                setType('ferie');
                setTrasfertaScope(null);
              }}
            >
              <Text style={[styles.chipText, type === 'ferie' && styles.chipTextOn]}>Ferie</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="Data inizio (YYYY-MM-DD)"
            placeholderTextColor={colors.textMuted}
          />
          <TextInput
            style={styles.input}
            value={endDate}
            onChangeText={setEndDate}
            placeholder="Data fine (YYYY-MM-DD)"
            placeholderTextColor={colors.textMuted}
          />

          {type === 'trasferta' ? (
            <>
              <Text style={styles.helper}>
                Le ore dichiarate in trasferta sono totali e comprendono anche le ore di viaggio
                (solo per monitoraggio interno).
              </Text>
              <Text style={styles.label}>Ore di viaggio</Text>
              <TextInput
                style={styles.input}
                value={travelHours}
                onChangeText={setTravelHours}
                placeholder="es. 2 o 2,5"
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textMuted}
              />
              <View style={styles.hoursScopeRow}>
                <View style={styles.hoursCol}>
                  <Text style={styles.label}>Ore totali dichiarate (incluse viaggio)</Text>
                  <TextInput
                    style={styles.input}
                    value={totalHoursDeclared}
                    onChangeText={setTotalHoursDeclared}
                    placeholder="es. 8"
                    keyboardType="decimal-pad"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
                <View style={styles.scopeCol}>
                  <Text style={styles.label}>Tipo</Text>
                  <View style={styles.scopeBtns}>
                    <Pressable
                      style={[styles.scopeChip, trasfertaScope === 'TI' && styles.scopeChipOn]}
                      onPress={() => setTrasfertaScope('TI')}
                    >
                      <Text
                        style={[styles.scopeChipText, trasfertaScope === 'TI' && styles.scopeChipTextOn]}
                      >
                        TI
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.scopeChip, trasfertaScope === 'TE' && styles.scopeChipOn]}
                      onPress={() => setTrasfertaScope('TE')}
                    >
                      <Text
                        style={[styles.scopeChipText, trasfertaScope === 'TE' && styles.scopeChipTextOn]}
                      >
                        TE
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.scopeHint}>Italia · Estero</Text>
                </View>
              </View>
            </>
          ) : null}

          <TextInput
            style={[styles.input, styles.noteInput]}
            value={note}
            onChangeText={setNote}
            placeholder="Note (opzionale)"
            placeholderTextColor={colors.textMuted}
            multiline
          />
          <Pressable style={styles.saveBtn} onPress={() => void saveRecord()} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? 'Salvataggio...' : 'Salva'}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTag}>CRONOLOGIA</Text>
          <Text style={styles.cardTitle}>Lista orari</Text>
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : items.length === 0 ? (
            <Text style={styles.empty}>Nessuna registrazione.</Text>
          ) : (
            items.map((it) => (
              <View key={it.id} style={styles.item}>
                <Text style={styles.itemType}>
                  {it.request_type === 'trasferta'
                    ? 'TRASFERTA'
                    : it.request_type === 'ferie'
                      ? 'FERIE'
                      : 'MALATTIA'}
                </Text>
                <Text style={styles.itemDates}>
                  {it.start_date} → {it.end_date}
                </Text>
                {it.request_type === 'trasferta' &&
                (it.travel_hours != null ||
                  it.total_hours_declared != null ||
                  it.trasferta_scope) ? (
                  <View style={styles.itemHoursRow}>
                    <Text style={styles.itemHours}>
                      Viaggio: {it.travel_hours != null ? `${it.travel_hours} h` : '—'} · Totali:{' '}
                      {it.total_hours_declared != null ? `${it.total_hours_declared} h` : '—'}
                    </Text>
                    {it.trasferta_scope ? (
                      <View style={styles.itemScopeBadge}>
                        <Text style={styles.itemScopeText}>{it.trasferta_scope}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {it.note ? <Text style={styles.itemNote}>{it.note}</Text> : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    ...layout.headerRow,
    paddingTop: space.sm,
    alignItems: 'flex-start',
  },
  headerText: { flex: 1, marginRight: space.sm },
  title: { ...typography.title },
  headerSub: { ...typography.caption, marginTop: 4, lineHeight: 18 },
  closePill: {
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
  },
  closePillText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  scroll: { padding: space.lg, paddingBottom: 40 },
  intro: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: space.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardTag: { ...typography.section, marginBottom: space.xs },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: space.md },
  row: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  chip: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
    backgroundColor: colors.surface2,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  chipText: { color: colors.textSecondary, fontWeight: '600' },
  chipTextOn: { color: colors.primary },
  helper: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: space.sm,
    lineHeight: 17,
  },
  hoursScopeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginBottom: 4,
  },
  hoursCol: { flex: 1, minWidth: 0 },
  scopeCol: { width: 88, paddingBottom: 2 },
  scopeBtns: { flexDirection: 'row', gap: 6 },
  scopeChip: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
    backgroundColor: colors.surface2,
  },
  scopeChipOn: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  scopeChipText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  scopeChipTextOn: { color: colors.primary },
  scopeHint: { fontSize: 10, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: space.sm },
  input: {
    ...base.input,
    marginBottom: space.md,
  },
  noteInput: { minHeight: 88, textAlignVertical: 'top' },
  saveBtn: {
    marginTop: space.sm,
    backgroundColor: colors.success,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    alignItems: 'center',
    ...shadow.sm,
  },
  saveBtnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 16 },
  empty: { color: colors.textSecondary, fontSize: 14 },
  item: {
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  itemType: { fontWeight: '800', color: colors.text, fontSize: 12, letterSpacing: 0.8 },
  itemDates: { color: colors.text, marginTop: 4, fontWeight: '600' },
  itemHoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginTop: space.sm,
  },
  itemHours: { color: colors.textSecondary, fontSize: 13, flex: 1, flexShrink: 1, lineHeight: 18 },
  itemScopeBadge: {
    backgroundColor: colors.primaryMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#c7d2fe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  itemScopeText: { fontWeight: '800', color: colors.primary, fontSize: 13 },
  itemNote: { color: colors.textSecondary, marginTop: space.sm, fontSize: 13, lineHeight: 18 },
});
