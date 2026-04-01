import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { DailyPunchRow } from './types';

export const PUNCH_STEPS = [
  { field: 'iniziomattina' as const, buttonText: 'Timbra Ingresso Mattina' },
  { field: 'finemattina' as const, buttonText: 'Timbra Uscita Pausa' },
  { field: 'iniziopomeriggio' as const, buttonText: 'Timbra Ingresso Pomeriggio' },
  { field: 'finepomeriggio' as const, buttonText: 'Timbra Uscita Fine Giornata' },
];

export function getLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function timeToMinutes(time: string | null | undefined) {
  if (!time) return 0;
  const [h, min] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (min ?? 0);
}

export function calculateBreakMinutes(data: {
  finemattina?: string | null;
  iniziopomeriggio?: string | null;
}) {
  const start = data.finemattina;
  const end = data.iniziopomeriggio;
  if (!start || !end) return null;
  const diff = timeToMinutes(end) - timeToMinutes(start);
  return diff > 0 ? diff : null;
}

export function nextPunchIndexFromRow(row: Partial<DailyPunchRow> | null) {
  let i = 0;
  for (const step of PUNCH_STEPS) {
    const v = row?.[step.field];
    if (v) i += 1;
    else break;
  }
  return i;
}

export async function loadTodayPunches(
  supabase: SupabaseClient,
  userId: string
): Promise<{ data: DailyPunchRow | null; error: Error | null }> {
  const today = getLocalDateString();
  const { data, error } = await supabase
    .from('daily_punches')
    .select('*')
    .eq('user_id', userId)
    .eq('punch_date', today)
    .maybeSingle();

  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as DailyPunchRow | null, error: null };
}

export async function upsertPunch(
  supabase: SupabaseClient,
  user: User,
  date: string,
  field: (typeof PUNCH_STEPS)[number]['field'],
  time: string
) {
  const { data: existingData } = await supabase
    .from('daily_punches')
    .select('id, user_id, punch_date, iniziomattina, finemattina, iniziopomeriggio, finepomeriggio, pausa_minuti')
    .eq('user_id', user.id)
    .eq('punch_date', date)
    .maybeSingle();

  let payload: Record<string, unknown> = {
    user_id: user.id,
    punch_date: date,
  };

  if (existingData) {
    payload = { ...existingData, user_id: user.id, punch_date: date };
  }
  payload.user_id = user.id;
  payload.punch_date = date;
  payload[field] = time;

  const breakMin = calculateBreakMinutes({
    finemattina: (payload.finemattina as string) ?? null,
    iniziopomeriggio: (payload.iniziopomeriggio as string) ?? null,
  });
  payload.pausa_minuti = breakMin;

  const { error } = await supabase.from('daily_punches').upsert(payload, {
    onConflict: 'user_id,punch_date',
    ignoreDuplicates: false,
  });
  return { error };
}
