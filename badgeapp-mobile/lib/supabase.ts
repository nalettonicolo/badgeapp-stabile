import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Timbrature Online — stesso progetto del sito web (ref pobrjdrqpzerjlcqnpra) */
const SUPABASE_PROJECT_REF = 'pobrjdrqpzerjlcqnpra';
const FALLBACK_SUPABASE_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co`;
const FALLBACK_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYnJqZHJxcHplcmpsY3FucHJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0ODgyODMsImV4cCI6MjA3NzA2NDI4M30.p2XZ7tA-OPye2T5hGhx89BNF-kyhTcnrnt33ho0jDKU';

const extra = Constants.expoConfig?.extra as
  | { supabaseUrl?: string; supabaseAnonKey?: string }
  | undefined;

const supabaseUrl = (extra?.supabaseUrl && extra.supabaseUrl.length > 0
  ? extra.supabaseUrl
  : FALLBACK_SUPABASE_URL);
const supabaseAnonKey = (extra?.supabaseAnonKey && extra.supabaseAnonKey.length > 0
  ? extra.supabaseAnonKey
  : FALLBACK_SUPABASE_ANON_KEY);

/** expo-secure-store non è implementato su web (nessun Keychain / Keystore). */
const WebLocalStorageAdapter = {
  getItem: (key: string): Promise<string | null> => {
    try {
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        return Promise.resolve(globalThis.localStorage.getItem(key));
      }
    } catch {
      /* ignore */
    }
    return Promise.resolve(null);
  },
  setItem: (key: string, value: string): Promise<void> => {
    try {
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        globalThis.localStorage.setItem(key, value);
      }
    } catch {
      /* ignore */
    }
    return Promise.resolve();
  },
  removeItem: (key: string): Promise<void> => {
    try {
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        globalThis.localStorage.removeItem(key);
      }
    } catch {
      /* ignore */
    }
    return Promise.resolve();
  },
};

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

/**
 * Su Expo Web a volte `Platform.OS` non è `web`; SecureStore non funziona nel browser.
 * Su iOS/Android usiamo sempre SecureStore (ignora eventuali polyfill di localStorage).
 */
function shouldUseWebAuthStorage(): boolean {
  if (Platform.OS === 'ios' || Platform.OS === 'android') return false;
  if (Platform.OS === 'web') return true;
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return typeof ls?.getItem === 'function' && typeof ls?.setItem === 'function';
  } catch {
    return false;
  }
}

const authStorage = shouldUseWebAuthStorage() ? WebLocalStorageAdapter : ExpoSecureStoreAdapter;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storageKey: `supabase-auth-${SUPABASE_PROJECT_REF}`,
  },
});
