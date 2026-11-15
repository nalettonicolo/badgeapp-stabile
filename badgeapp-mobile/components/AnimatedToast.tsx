import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Text } from 'react-native';
import { layout } from '../lib/theme';

type Props = { text: string; error?: boolean };

/**
 * Messaggio di esito (es. conferma di timbratura): entra dall'alto con una breve
 * dissolvenza. Con "riduci movimento" attivo nel sistema compare subito, senza
 * animazione. Lo screen reader lo legge come avviso.
 */
export function AnimatedToast({ text, error = false }: Props) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) {
        progress.setValue(1);
        return;
      }
      Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [progress]);

  return (
    <Animated.View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        layout.toastOk,
        error && layout.toastErr,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
        },
      ]}
    >
      <Text style={layout.toastText}>{text}</Text>
    </Animated.View>
  );
}
