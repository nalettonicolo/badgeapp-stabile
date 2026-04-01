import { Platform, StyleSheet } from 'react-native';

/** Palette coerente iOS/Android — stile “app 2025” chiaro */
export const colors = {
  bg: '#f1f5f9',
  surface: '#ffffff',
  surface2: '#f8fafc',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  text: '#0f172a',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  primary: '#4f46e5',
  primaryPressed: '#4338ca',
  primaryMuted: '#eef2ff',
  onPrimary: '#ffffff',
  success: '#059669',
  successMuted: '#ecfdf5',
  danger: '#dc2626',
  dangerMuted: '#fef2f2',
  warning: '#b45309',
  warningBg: '#fffbeb',
  warningBorder: '#fde68a',
  geo: '#ea580c',
  geoMuted: '#fff7ed',
  overlay: 'rgba(15, 23, 42, 0.55)',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;
export const radius = { sm: 10, md: 14, lg: 18, xl: 22, pill: 999 } as const;

export const shadow = {
  /** Ombra morbida tipo card Material / iOS */
  card: Platform.select({
    ios: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.07,
      shadowRadius: 16,
    },
    android: { elevation: 3 },
    default: {},
  }),
  sm: Platform.select({
    ios: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
    android: { elevation: 2 },
    default: {},
  }),
} as const;

export const typography = {
  hero: { fontSize: 28, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.6 },
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 15, fontWeight: '500' as const, color: colors.textSecondary, lineHeight: 22 },
  section: { fontSize: 13, fontWeight: '700' as const, color: colors.textMuted, letterSpacing: 0.6 },
  body: { fontSize: 16, color: colors.text },
  bodyMedium: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  caption: { fontSize: 13, color: colors.textSecondary },
  small: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
} as const;

/** Stili plain componibili (no StyleSheet) per poter usare spread in altri StyleSheet.create */
export const base = {
  input: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontSize: 16,
    color: colors.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
} as const;

export const layout = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitleBlock: { flex: 1, marginRight: space.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardFlat: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  btnPrimary: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: space.lg,
    alignItems: 'center',
    ...shadow.sm,
  },
  btnPrimaryText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' as const },
  btnOutline: {
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  btnOutlineText: { fontSize: 15, fontWeight: '600' as const, color: colors.primary },
  toastOk: {
    backgroundColor: colors.success,
    marginHorizontal: space.lg,
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    ...shadow.sm,
  },
  toastErr: {
    backgroundColor: colors.danger,
    marginHorizontal: space.lg,
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.md,
  },
  toastText: { color: colors.onPrimary, fontWeight: '600' as const, fontSize: 14 },
});
