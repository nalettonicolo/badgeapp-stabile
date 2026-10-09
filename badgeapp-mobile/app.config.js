// ID pubblico del progetto EAS (https://expo.dev/accounts/nalettonicolo/projects/badgeapp-mobile),
// non un segreto: eas init non può scriverlo da solo qui perché questa è
// una config dinamica (app.config.js), non un app.json statico.
// "||" e non "??": il workflow CI referenzia sempre EAS_PROJECT_ID come env
// (secrets.EAS_PROJECT_ID), quindi se il secret non esiste GitHub Actions
// imposta comunque la variabile a stringa vuota, non "undefined" — "??" non
// l'avrebbe mai considerata assente e il fallback qui sotto non sarebbe mai
// scattato (bug reale osservato in CI: "EAS project not configured").
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID || 'd80ac4ac-b39e-420f-a1d2-b13fe4381481';

/** @type {import('@expo/config').ExpoConfig} */
module.exports = {
  expo: {
    name: 'BadgeApp',
    slug: 'badgeapp-mobile',
    version: '1.1.0',
    orientation: 'portrait',
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      // Richiesto da EAS Update per sapere dove controllare gli aggiornamenti
      // OTA (eas-cli update fallisce con "Cannot automatically write to
      // dynamic config" se manca, visto che app.config.js è dinamico e la
      // CLI non può scriverlo da sola).
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
    },
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-updates',
      'expo-secure-store',
    ],
    extra: {
      eas: {
        projectId: EAS_PROJECT_ID,
      },
      supabaseUrl:
        process.env.EXPO_PUBLIC_SUPABASE_URL ??
        'https://pobrjdrqpzerjlcqnpra.supabase.co',
      supabaseAnonKey:
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYnJqZHJxcHplcmpsY3FucHJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0ODgyODMsImV4cCI6MjA3NzA2NDI4M30.p2XZ7tA-OPye2T5hGhx89BNF-kyhTcnrnt33ho0jDKU',
    },
  },
};
