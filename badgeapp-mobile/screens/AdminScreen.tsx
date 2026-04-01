import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../App';
import { useAuth } from '../context/AuthContext';
import { fetchWebGeofenceConfig, saveWebGeofenceRules } from '../lib/serverGeofence';
import { supabase } from '../lib/supabase';
import { base, colors, layout, radius, shadow, space, typography } from '../lib/theme';

type AdminNav = NativeStackNavigationProp<RootStackParamList, 'Admin'>;

type ProfileRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_admin: boolean | null;
};

export default function AdminScreen() {
  const { isAdmin } = useAuth();
  const navigation = useNavigation<AdminNav>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [isAdminField, setIsAdminField] = useState(false);
  const [geoAddress, setGeoAddress] = useState('');
  const [geoRIn, setGeoRIn] = useState('120');
  const [geoROut, setGeoROut] = useState('120');
  const [geoAcc, setGeoAcc] = useState('60');
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);

  const showToast = useCallback((text: string, error = false) => {
    setToast({ text, error });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: geo, error: geoError } = await fetchWebGeofenceConfig();
    if (geoError) {
      showToast(`Errore geofence: ${geoError.message}`, true);
    }
    setGeoAddress(geo?.address ?? '');
    setGeoRIn(String(geo?.radiusEntryMeters ?? 120));
    setGeoROut(String(geo?.radiusExitMeters ?? 120));
    setGeoAcc(String(geo?.maxAccuracyMeters ?? 60));

    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,first_name,last_name,is_admin')
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true });

    setLoading(false);
    if (error) {
      showToast(error.message, true);
      return;
    }
    const list = (data ?? []) as ProfileRow[];
    setProfiles(list);
  }, [showToast]);

  useFocusEffect(
    useCallback(() => {
      if (!isAdmin) return;
      void loadData();
    }, [isAdmin, loadData])
  );

  function selectProfile(item: ProfileRow) {
    setSelectedId(item.id);
    setFirstName(item.first_name ?? '');
    setLastName(item.last_name ?? '');
    setEmail(item.email ?? '');
    setIsAdminField(Boolean(item.is_admin));
  }

  async function saveProfile() {
    if (!selectedId) {
      showToast('Seleziona un utente da modificare.', true);
      return;
    }
    setSaving(true);
    const payload = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      is_admin: isAdminField,
    };
    const { error } = await supabase.from('profiles').update(payload).eq('id', selectedId);
    setSaving(false);
    if (error) {
      showToast(error.message, true);
      return;
    }
    showToast('Profilo aggiornato.');
    await loadData();
  }

  async function saveGpsRules() {
    const radiusEntry = Number.parseFloat(geoRIn);
    const radiusExit = Number.parseFloat(geoROut);
    const maxAccuracy = Number.parseFloat(geoAcc);
    if (!Number.isFinite(radiusEntry) || radiusEntry < 10) {
      showToast('Raggio ingresso non valido (min 10m).', true);
      return;
    }
    if (!Number.isFinite(radiusExit) || radiusExit < 10) {
      showToast('Raggio uscita non valido (min 10m).', true);
      return;
    }
    if (!Number.isFinite(maxAccuracy) || maxAccuracy < 5) {
      showToast('Precisione GPS max non valida (min 5m).', true);
      return;
    }
    const { error } = await saveWebGeofenceRules({
      address: geoAddress.trim(),
      radiusEntryMeters: radiusEntry,
      radiusExitMeters: radiusExit,
      maxAccuracyMeters: maxAccuracy,
    });
    if (error) {
      showToast(error.message, true);
      return;
    }
    showToast('Regole GPS web salvate. Posizione sede invariata.');
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.deniedWrap}>
          <Text style={styles.deniedTitle}>Area amministrazione</Text>
          <Text style={styles.deniedText}>Accesso negato: account non amministratore.</Text>
          <Pressable style={styles.deniedBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.deniedBtnText}>Indietro</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Admin</Text>
          <Text style={styles.headerSub}>Utenti e regole GPS (no posizione sede)</Text>
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

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.cardTag}>DIPENDENTI</Text>
            <Text style={styles.cardTitle}>Seleziona un utente</Text>
            {profiles.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => selectProfile(p)}
                style={[styles.userRow, selectedId === p.id && styles.userRowSelected]}
              >
                <Text style={styles.userName}>
                  {(p.first_name ?? '').trim()} {(p.last_name ?? '').trim()}
                </Text>
                <Text style={styles.userEmail}>{p.email}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTag}>PROFILO</Text>
            <Text style={styles.cardTitle}>Modifica dati</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Nome"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Cognome"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              autoCapitalize="none"
              placeholderTextColor={colors.textMuted}
            />
            <Pressable style={styles.toggle} onPress={() => setIsAdminField((v) => !v)}>
              <Text style={styles.toggleText}>Diritti admin: {isAdminField ? 'Sì' : 'No'}</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={() => void saveProfile()}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Salvataggio…' : 'Salva utente'}</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTag}>GPS</Text>
            <Text style={styles.cardTitle}>Regole (web)</Text>
            <Text style={styles.note}>
              Modificabili: indirizzo, raggi, precisione. Latitudine/longitudine sede restano sul web.
            </Text>
            <TextInput
              style={styles.input}
              value={geoAddress}
              onChangeText={setGeoAddress}
              placeholder="Indirizzo sede"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={styles.input}
              value={geoRIn}
              onChangeText={setGeoRIn}
              placeholder="Raggio ingresso (m)"
              keyboardType="number-pad"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={styles.input}
              value={geoROut}
              onChangeText={setGeoROut}
              placeholder="Raggio uscita (m)"
              keyboardType="number-pad"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={styles.input}
              value={geoAcc}
              onChangeText={setGeoAcc}
              placeholder="Precisione max GPS (m)"
              keyboardType="number-pad"
              placeholderTextColor={colors.textMuted}
            />
            <Pressable style={styles.saveBtn} onPress={() => void saveGpsRules()}>
              <Text style={styles.saveBtnText}>Salva regole GPS</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
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
  headerTitle: { ...typography.title },
  headerSub: { ...typography.caption, marginTop: 4, lineHeight: 18 },
  closePill: {
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
  },
  closePillText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  scroll: { padding: space.lg, paddingBottom: 40 },
  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  userRow: {
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  userRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  userName: { fontSize: 15, fontWeight: '600', color: colors.text },
  userEmail: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  input: {
    ...base.input,
    marginBottom: space.md,
  },
  toggle: {
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
    marginBottom: space.md,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  toggleText: { color: colors.text, fontWeight: '600' },
  saveBtn: {
    backgroundColor: colors.success,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    alignItems: 'center',
    ...shadow.sm,
  },
  saveBtnDisabled: { opacity: 0.65 },
  saveBtnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 15 },
  note: { fontSize: 12, color: colors.textSecondary, marginBottom: space.md, lineHeight: 18 },
  deniedWrap: { flex: 1, justifyContent: 'center', padding: space.xl },
  deniedTitle: { ...typography.title, textAlign: 'center' },
  deniedText: { ...typography.caption, textAlign: 'center', marginTop: space.md, lineHeight: 20 },
  deniedBtn: {
    marginTop: space.xl,
    alignSelf: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.lg,
  },
  deniedBtnText: { color: colors.onPrimary, fontWeight: '700' },
});
