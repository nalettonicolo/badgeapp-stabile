/**
 * BadgeApp / Timbrature Online — funzioni pure condivise.
 *
 * Estratte da index.html (Fase 3 refactor): nessuna dipendenza dal DOM o da
 * stato globale, solo calcoli su date/orari. Copiate verbatim, nessuna
 * modifica di comportamento. Stesse regole di badgeapp-mobile/lib/punch.ts
 * (timeToMinutes / calcolo pausa), riportate qui per il web.
 */

/** Errore di rete / fetch (non RLS): messaggio utente diverso da policy DB */
export function isLikelyNetworkError(err) {
    const m = String(err?.message ?? err ?? "");
    const low = m.toLowerCase();
    return (
        low.includes("failed to fetch") ||
        low.includes("networkerror") ||
        low.includes("network request failed") ||
        low.includes("load failed") ||
        low.includes("aborted") ||
        low.includes("timeout")
    );
}

export function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function getTodayDateString() {
    return getLocalDateString();
}

/** Tutte le date (YYYY-MM-DD) da startStr a endStr, estremi inclusi. Array vuoto su input non valido/invertito. */
export function enumerateDatesInRange(startStr, endStr) {
    const out = [];
    if (!startStr || !endStr) return out;
    let cursor = new Date(startStr + "T12:00:00");
    const end = new Date(endStr + "T12:00:00");
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return out;
    let guard = 0;
    while (cursor <= end && guard < 3660) { // ~10 anni di margine, non blocca mai su input plausibili
        out.push(getLocalDateString(cursor));
        cursor.setDate(cursor.getDate() + 1);
        guard++;
    }
    return out;
}

/**
 * Giorni lavorativi (lun-ven) da startStr a endStr, estremi inclusi.
 * Nessuno "consuma" un giorno di ferie per un sabato/domenica in cui
 * comunque non lavorerebbe: il conteggio mostrato al dipendente e
 * all'admin deve riflettere questo, anche se l'intervallo Dal/Al scelto
 * nel modulo può includere il weekend (es. "dal venerdì al lunedì").
 */
export function countBusinessDays(startStr, endStr) {
    return enumerateDatesInRange(startStr, endStr).filter((d) => {
        const day = new Date(d + "T12:00:00").getDay(); // 0 = domenica, 6 = sabato
        return day !== 0 && day !== 6;
    }).length;
}

export function isRlsPolicyError(error) {
    if (!error) return false;
    const text = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
    return text.includes("row-level security") || text.includes("new row violates");
}

/** Normalizza orario DB (HH:MM o HH:MM:SS) per input type=time con step=1 */
export function normalizeTimeForInput(raw) {
    if (raw == null || raw === "") return "";
    const s = String(raw).trim();
    const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return s;
    const hh = String(parseInt(m[1], 10)).padStart(2, "0");
    const mm = String(parseInt(m[2], 10)).padStart(2, "0");
    const ss = m[3] != null ? String(parseInt(m[3], 10)).padStart(2, "0") : "00";
    return `${hh}:${mm}:${ss}`;
}

export function timeToMinutes(time) {
    if (!time) return 0;
    const parts = String(time).trim().split(":");
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    return hours * 60 + minutes;
}

/** Verifica sequenza orari incoerente (non conformità) */
export function analyzePunchNonConformity(p) {
    const issues = [];
    if (!p) return issues;
    const has = (f) => !!(p[f] && String(p[f]).trim());
    const m = (f) => (has(f) ? timeToMinutes(p[f]) : null);
    const inM = m("iniziomattina"), fm = m("finemattina"), ip = m("iniziopomeriggio"), fp = m("finepomeriggio");
    if (inM != null && fm != null && fm < inM) issues.push("Fine mattina precedente all’inizio mattina.");
    if (fm != null && ip != null && ip < fm) issues.push("Inizio pomeriggio precedente alla fine pausa.");
    if (ip != null && fp != null && fp < ip) issues.push("Uscita precedente all’ingresso pomeriggio.");
    if (fp != null && inM == null) issues.push("Uscita registrata senza ingresso mattina.");
    return issues;
}

export function minutesToHHMM(totalMinutes) {
    if (totalMinutes === 0) return '00:00';
    const sign = totalMinutes < 0 ? '-' : '';
    const absMinutes = Math.abs(totalMinutes);
    const hours = Math.floor(absMinutes / 60);
    const minutes = absMinutes % 60;
    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Calcola i minuti effettivi lavorati (spezzato) O la durata lorda (continuato).
 * @param {object} punch - Dati di timbratura giornaliera.
 */
export function calculateWorkMinutes(punch) {
    const startMorning = timeToMinutes(punch.iniziomattina);
    const endMorning = timeToMinutes(punch.finemattina);
    const startAfternoon = timeToMinutes(punch.iniziopomeriggio);
    const endAfternoon = timeToMinutes(punch.finepomeriggio);

    let morningWork = 0;
    let afternoonWork = 0;
    // Calcola il segmento mattina
    if (startMorning > 0 && endMorning > 0) {
         morningWork = endMorning - startMorning;
    }

    // Calcola il segmento pomeriggio
    if (startAfternoon > 0 && endAfternoon > 0) {
         afternoonWork = endAfternoon - startAfternoon;
    }

    let totalWork = morningWork + afternoonWork;
    // Logica per orario continuato o segmenti mancanti:
    // Se il lavoro spezzato è zero (o incompleto) ma ci sono Inizio Mattina e Fine Pomeriggio (2 punch),
    // calcola la durata totale.
    // (Questo copre i giorni da 13 ore).
    if (totalWork === 0 && startMorning > 0 && endAfternoon > 0) {
         totalWork = endAfternoon - startMorning;
    }

    if (totalWork < 0) {
         console.warn("Conteggio minuti negativo, timbrature fuori sequenza. Ritorno 0.");
        return 0;
    }

    return totalWork;
}

export function inclusiveCalendarDays(startStr, endStr) {
    const a = new Date(startStr + "T12:00:00");
    const b = new Date(endStr + "T12:00:00");
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
    const diff = Math.round((b - a) / 86400000);
    return diff >= 0 ? diff + 1 : 0;
}

/** Giorni di trasferita che cadono nel mese (estremi inclusi, stringhe YYYY-MM-DD). */
export function overlapDaysInMonthRange(startStr, endStr, year, month) {
    const monthStartStr = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEndStr = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const lo = startStr > monthStartStr ? startStr : monthStartStr;
    const hi = endStr < monthEndStr ? endStr : monthEndStr;
    if (lo > hi) return 0;
    return inclusiveCalendarDays(lo, hi);
}

// -----------------------------------------------------------------------------
// Geofence — timbratura automatica per posizione (ingresso mattutino, opt-in)
// -----------------------------------------------------------------------------

/** Distanza in metri tra due punti lat/lng (formula haversine). */
export function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000; // raggio terrestre medio in metri
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Punto-in-poligono (ray casting). `polygon` è un array di {lat, lng} che
 * rappresenta un anello semplice (non serve chiuderlo esplicitamente).
 * Precisione planare: adeguata per aree piccole (sede/cortile), non per
 * poligoni di scala geografica.
 */
export function pointInPolygon(lat, lng, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const pi = polygon[i];
        const pj = polygon[j];
        if (!pi || !pj) continue;
        const xi = pi.lng, yi = pi.lat;
        const xj = pj.lng, yj = pj.lat;
        const intersects =
            (yi > lat) !== (yj > lat) &&
            lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
        if (intersects) inside = !inside;
    }
    return inside;
}

/**
 * True se (lat, lng) è dentro l'area di timbratura automatica configurata.
 * Preferisce il poligono disegnato (`settings.polygon_path`, >= 3 punti); in
 * assenza usa il cerchio (`center_lat`/`center_lng` + `radius_entry_meters`),
 * per compatibilità con un eventuale ripristino della vecchia modalità solo-cerchio.
 */
export function isInsideGeofence(lat, lng, settings) {
    if (!settings) return false;
    const polygon = Array.isArray(settings.polygon_path) ? settings.polygon_path : [];
    if (polygon.length >= 3) {
        return pointInPolygon(lat, lng, polygon);
    }
    const { center_lat, center_lng, radius_entry_meters } = settings;
    if (
        !Number.isFinite(center_lat) || !Number.isFinite(center_lng) ||
        (center_lat === 0 && center_lng === 0) // 0,0 = non configurato
    ) {
        return false;
    }
    const radius = Number.isFinite(radius_entry_meters) ? radius_entry_meters : 120;
    return haversineDistanceMeters(lat, lng, center_lat, center_lng) <= radius;
}

/** True se la configurazione dell'area è utilizzabile (poligono o cerchio validi). */
export function hasUsableGeofence(settings) {
    if (!settings) return false;
    const polygon = Array.isArray(settings.polygon_path) ? settings.polygon_path : [];
    if (polygon.length >= 3) return true;
    const { center_lat, center_lng } = settings;
    return Number.isFinite(center_lat) && Number.isFinite(center_lng) && !(center_lat === 0 && center_lng === 0);
}
