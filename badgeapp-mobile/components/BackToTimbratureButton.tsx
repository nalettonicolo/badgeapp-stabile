import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, space } from '../lib/theme';

type Props = {
  navigation: { navigate: (screen: 'Punch') => void };
  label?: string;
  compact?: boolean;
};

export function BackToTimbratureButton({
  navigation,
  label = 'Torna alle timbrature',
  compact = false,
}: Props) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        compact && styles.btnCompact,
        pressed && styles.pressed,
      ]}
      onPress={() => navigation.navigate('Punch')}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.text, compact && styles.textCompact]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    marginTop: space.lg,
  },
  btnCompact: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    marginTop: 0,
    borderRadius: radius.pill,
  },
  pressed: { opacity: 0.88 },
  text: { color: colors.onPrimary, fontWeight: '700', fontSize: 16 },
  textCompact: { fontSize: 14 },
});
