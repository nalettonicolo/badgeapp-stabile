import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

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

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storageKey: `supabase-auth-${SUPABASE_PROJECT_REF}`,
  },
});
