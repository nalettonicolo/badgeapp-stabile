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
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'La posizione serve per la timbratura automatica quando sei in sede.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'La posizione serve per la timbratura automatica quando sei in sede.',
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-updates',
      'expo-secure-store',
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Consenti l’accesso alla posizione per la timbratura automatica in sede.',
          locationAlwaysAndWhenInUsePermission:
            'Consenti l’accesso alla posizione per la timbratura automatica in sede.',
        },
      ],
    ],
    extra: {
      ...(process.env.EAS_PROJECT_ID
        ? { eas: { projectId: process.env.EAS_PROJECT_ID } }
        : {}),
      supabaseUrl:
        process.env.EXPO_PUBLIC_SUPABASE_URL ??
        'https://pobrjdrqpzerjlcqnpra.supabase.co',
      supabaseAnonKey:
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYnJqZHJxcHplcmpsY3FucHJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0ODgyODMsImV4cCI6MjA3NzA2NDI4M30.p2XZ7tA-OPye2T5hGhx89BNF-kyhTcnrnt33ho0jDKU',
    },
  },
};
