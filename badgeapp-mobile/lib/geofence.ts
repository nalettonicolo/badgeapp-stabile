import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GeofenceConfig } from './types';

export const GEOFENCE_STORAGE_KEY = 'badgeapp-geofence-config-v1';

export const DEFAULT_GEOFENCE: GeofenceConfig = {
  address: '',
  centerLat: 0,
  centerLng: 0,
  radiusEntryMeters: 120,
  radiusExitMeters: 120,
  maxAccuracyMeters: 60,
  polygonPath: [],
};

export async function saveGeofenceConfig(cfg: GeofenceConfig): Promise<void> {
  await AsyncStorage.setItem(GEOFENCE_STORAGE_KEY, JSON.stringify(cfg));
}

export async function loadGeofenceConfig(): Promise<GeofenceConfig> {
  const raw = await AsyncStorage.getItem(GEOFENCE_STORAGE_KEY);
  if (!raw) return { ...DEFAULT_GEOFENCE };
  try {
    const parsed = JSON.parse(raw) as Partial<GeofenceConfig>;
    return {
      address: typeof parsed.address === 'string' ? parsed.address : '',
      centerLat: Number.isFinite(parsed.centerLat) ? (parsed.centerLat as number) : 0,
      centerLng: Number.isFinite(parsed.centerLng) ? (parsed.centerLng as number) : 0,
      radiusEntryMeters:
        Number.isFinite(parsed.radiusEntryMeters) && (parsed.radiusEntryMeters as number) > 0
          ? (parsed.radiusEntryMeters as number)
          : 120,
      radiusExitMeters:
        Number.isFinite(parsed.radiusExitMeters) && (parsed.radiusExitMeters as number) > 0
          ? (parsed.radiusExitMeters as number)
          : 120,
      maxAccuracyMeters:
        Number.isFinite(parsed.maxAccuracyMeters) && (parsed.maxAccuracyMeters as number) > 0
          ? (parsed.maxAccuracyMeters as number)
          : 60,
      polygonPath: Array.isArray(parsed.polygonPath)
        ? parsed.polygonPath
            .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng))
            .map((p) => ({ lat: p.lat, lng: p.lng }))
        : [],
    };
  } catch {
    return { ...DEFAULT_GEOFENCE };
  }
}

export function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function isPointInsidePolygon(
  pointLat: number,
  pointLng: number,
  polygonPath: { lat: number; lng: number }[]
) {
  if (!Array.isArray(polygonPath) || polygonPath.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygonPath.length - 1; i < polygonPath.length; j = i++) {
    const xi = polygonPath[i].lat;
    const yi = polygonPath[i].lng;
    const xj = polygonPath[j].lat;
    const yj = polygonPath[j].lng;
    const intersect =
      (yi > pointLng) !== (yj > pointLng) &&
      pointLat < ((xj - xi) * (pointLng - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isGeofenceConfigured(cfg: GeofenceConfig) {
  return (
    Number.isFinite(cfg.centerLat) &&
    Number.isFinite(cfg.centerLng) &&
    !(cfg.centerLat === 0 && cfg.centerLng === 0)
  );
}

export function isEntryStep(index: number) {
  return index === 0 || index === 2;
}

export function getRequiredRadiusByStep(index: number, cfg: GeofenceConfig) {
  return isEntryStep(index) ? cfg.radiusEntryMeters : cfg.radiusExitMeters;
}
