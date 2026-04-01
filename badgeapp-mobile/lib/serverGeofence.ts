import {
  isGeofenceConfigured,
  loadGeofenceConfig,
  saveGeofenceConfig,
} from './geofence';
import { supabase } from './supabase';
import type { GeofenceConfig } from './types';

type GeofenceRow = {
  id: number;
  address: string | null;
  center_lat: number | null;
  center_lng: number | null;
  radius_entry_meters: number | null;
  radius_exit_meters: number | null;
  max_accuracy_meters: number | null;
  polygon_path: { lat: number; lng: number }[] | null;
};

function normalizePolygon(
  polygon: GeofenceRow['polygon_path']
): { lat: number; lng: number }[] {
  if (!Array.isArray(polygon)) return [];
  return polygon
    .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p) => ({ lat: p.lat, lng: p.lng }));
}

function rowToConfig(row: GeofenceRow): GeofenceConfig {
  return {
    address: row.address ?? '',
    centerLat: row.center_lat ?? 0,
    centerLng: row.center_lng ?? 0,
    radiusEntryMeters: row.radius_entry_meters ?? 120,
    radiusExitMeters: row.radius_exit_meters ?? 120,
    maxAccuracyMeters: row.max_accuracy_meters ?? 60,
    polygonPath: normalizePolygon(row.polygon_path),
  };
}

export async function fetchWebGeofenceConfig(): Promise<{
  data: GeofenceConfig | null;
  error: Error | null;
  usedLocalCache: boolean;
}> {
  const { data, error } = await supabase
    .from('geofence_settings')
    .select(
      'id,address,center_lat,center_lng,radius_entry_meters,radius_exit_meters,max_accuracy_meters,polygon_path'
    )
    .eq('id', 1)
    .maybeSingle();

  if (!error && data) {
    const cfg = rowToConfig(data as GeofenceRow);
    if (isGeofenceConfigured(cfg)) {
      await saveGeofenceConfig(cfg);
    }
    return { data: cfg, error: null, usedLocalCache: false };
  }

  const local = await loadGeofenceConfig();
  if (isGeofenceConfigured(local)) {
    return { data: local, error: null, usedLocalCache: true };
  }

  if (error) return { data: null, error: new Error(error.message), usedLocalCache: false };
  return { data: null, error: null, usedLocalCache: false };
}

export async function saveWebGeofenceRules(payload: {
  address: string;
  radiusEntryMeters: number;
  radiusExitMeters: number;
  maxAccuracyMeters: number;
}): Promise<{ error: Error | null }> {
  const { data: currentData, error: readError } = await supabase
    .from('geofence_settings')
    .select(
      'id,address,center_lat,center_lng,radius_entry_meters,radius_exit_meters,max_accuracy_meters,polygon_path'
    )
    .eq('id', 1)
    .maybeSingle();
  if (readError) return { error: new Error(readError.message) };
  if (!currentData) {
    return { error: new Error('Geofence web non configurata. Imposta prima la sede sul web.') };
  }

  const row = currentData as GeofenceRow;
  const upsertPayload = {
    id: 1,
    address: payload.address,
    center_lat: row.center_lat,
    center_lng: row.center_lng,
    radius_entry_meters: payload.radiusEntryMeters,
    radius_exit_meters: payload.radiusExitMeters,
    max_accuracy_meters: payload.maxAccuracyMeters,
    polygon_path: row.polygon_path ?? [],
  };
  const { error } = await supabase.from('geofence_settings').upsert(upsertPayload, {
    onConflict: 'id',
    ignoreDuplicates: false,
  });
  return { error: error ? new Error(error.message) : null };
}
