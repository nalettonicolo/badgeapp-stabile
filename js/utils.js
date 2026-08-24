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
