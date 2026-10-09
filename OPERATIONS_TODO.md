# Da fare manualmente (accesso dashboard, non automatizzabile da qui)

Questi punti richiedono accesso a pannelli (Supabase Dashboard, GitHub Settings, ecc.)
che l'agente non ha. Vanno fatti a mano dal proprietario del progetto.

## Supabase → Authentication → Settings

- [ ] **Lunghezza minima password**: di default Supabase Auth accetta password da 6
  caratteri lato server, indipendentemente da cosa impone il form (`minlength`
  lato client è solo una comodità UX, aggirabile chiamando l'API direttamente).
  Alzare il minimo qui: https://supabase.com/dashboard/project/pobrjdrqpzerjlcqnpra/auth/providers
  (Password → Minimum password length). Consigliato: almeno 10-12.
- [ ] **Leaked Password Protection**: attualmente disabilitata (rilevato dal linter
  di sicurezza Supabase). Abilitarla blocca le password compromesse note
  (controllo contro HaveIBeenPwned). Stesso pannello di cui sopra.

## Supabase → Account → Access Tokens

- [ ] **SUPABASE_ACCESS_TOKEN per la riattivazione automatica del keepalive**:
  `.github/workflows/supabase-keepalive.yml` ora prova a riattivare da solo
  il progetto se lo trova in pausa, ma serve un Personal Access Token
  Supabase come secret GitHub (`SUPABASE_ACCESS_TOKEN`) — l'agente non può
  generarlo (richiede login alla dashboard). Istruzioni passo-passo in
  `.github/GITHUB_SECRETS.md`. Senza questo secret il workflow resta solo
  un ping preventivo: se il progetto va comunque in pausa, va riattivato a
  mano dalla dashboard.

## Supabase → Edge Functions → Secrets

- [ ] **ANTHROPIC_API_KEY per la lettura automatica (OCR) delle buste paga**:
  la Edge Function `ocr-payslip` (già distribuita, `supabase/functions/ocr-payslip/index.ts`)
  legge il PDF/foto caricato in Storage e chiede a un modello Claude di
  estrarre le ore di ferie/ROL/permesso dichiarate. Serve una API key
  Anthropic come secret del progetto Supabase — l'agente non può crearla
  (richiede un account su https://console.anthropic.com). Impostarla da:
  https://supabase.com/dashboard/project/pobrjdrqpzerjlcqnpra/functions/secrets
  (nome esatto: `ANTHROPIC_API_KEY`), oppure con la CLI:
  `supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref pobrjdrqpzerjlcqnpra`.
  Senza questo secret il pulsante "Leggi automaticamente (OCR)" nell'app
  risponde con un messaggio esplicito e **non blocca nulla**: l'inserimento
  manuale delle ore dichiarate resta sempre disponibile e sufficiente per
  usare il confronto busta paga.

## Expo/EAS → Account dell'azienda

- [ ] **Progetto EAS + EXPO_TOKEN per pubblicare davvero gli aggiornamenti OTA mobile**:
  `.github/workflows/publish-mobile-ota.yml` esiste e gira a ogni push su
  `badgeapp-mobile/`, ma non ha mai pubblicato nulla: verificato nei log
  reali del workflow, salta sempre con "EXPO_TOKEN non impostato" perché
  quel secret non è mai stato creato. In più non esiste ancora nessun
  progetto EAS collegato (`app.config.js` legge `EAS_PROJECT_ID` da env,
  ma la variabile non è mai stata impostata né in CI né altrove) — serve
  un login reale su un account Expo (gratuito) che l'agente non può fare
  da qui. Istruzioni passo-passo (login, `eas init`, generare il token, 2
  secret GitHub da aggiungere) in `.github/GITHUB_SECRETS.md`, sezione
  "Publish mobile OTA". Finché non è fatto: il sito web continua a
  pubblicarsi da solo via Netlify a ogni push (non serve nulla di questo
  per il web); solo l'app mobile nativa resta senza aggiornamenti OTA
  automatici.

## Branding / design (decisione di prodotto, non tecnica)

- [x] **Logo "T" (Timbrature) su icone web (PWA) e mobile**: monogramma
  vettoriale disegnato ad hoc (non un glifo generico orologio come nella
  versione precedente), gradiente brand (`var(--brand)` #1d4ed8 →
  `var(--brand-dark)` #1e3a8a). Copre TUTTI i contesti "salva su schermata
  home": `apple-touch-icon` (iOS Safari → Aggiungi a Home), le tre icone
  di `manifest.webmanifest` (Android/Chrome → Installa app), e
  `badgeapp-mobile/assets/icon.png` + `adaptive-icon.png` (icona app
  nativa iOS/Android via Expo/EAS quando pubblicata). Icona maskable e
  adaptive Android con il glifo confinato nella safe zone (non ritagliato
  dalle maschere circolari/squircle dei launcher).
- [ ] **Logo aziendale reale** (opzionale): il monogramma "T" è un design
  originale, non un logo aziendale registrato. Se l'azienda ha (o vuole)
  un logo proprio diverso, può sostituire questi stessi file mantenendo
  nomi/dimensioni.

## Osservabilità (decisione di prodotto/budget)

- [ ] **Error tracking reale (es. Sentry)**: la Fase 5 ha aggiunto un
  gestore globale (`window.onerror`/`unhandledrejection`) che mostra un
  messaggio all'utente e logga in console — un netto miglioramento rispetto
  a prima (errori che sparivano nel nulla), ma resta locale al browser
  dell'utente: nessuno lato team lo vede. Un servizio di error tracking
  richiede un account/API key di terzi che l'agente non può creare per
  conto vostro; se interessa, indicare quale servizio si vuole usare.

## i18n

Deliberatamente non implementata in Fase 5: l'app è a uso interno di
un'azienda italiana, non risultano richieste di altre lingue. Costruire un
sistema multi-lingua completo (estrazione di ogni stringa, selettore
lingua, mantenimento traduzioni) sarebbe lavoro speso senza un bisogno
reale dietro. Se in futuro serve, va pianificato come attività a sé.

## Note

Aggiungere qui altri item mano a mano che emergono durante il lavoro di
irrobustimento ("enterprise hardening") in corso sul repo.
