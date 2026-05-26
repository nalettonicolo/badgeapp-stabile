export type DailyPunchRow = {
  id?: string;
  user_id: string;
  punch_date: string;
  iniziomattina?: string | null;
  finemattina?: string | null;
  iniziopomeriggio?: string | null;
  finepomeriggio?: string | null;
  pausa_minuti?: number | null;
};
