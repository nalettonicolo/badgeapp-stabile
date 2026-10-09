# Secret GitHub Actions (badgeapp-stabile)

## Supabase Keepalive

Il workflow **Supabase Keepalive** funziona anche **senza secret**: usa i default pubblici del progetto Timbrature Online già presenti in `index.html`.

Secret **opzionali** (Settings → Secrets and variables → Actions → Repository secrets), solo se vuoi override:

| Nome | Valore |
|------|--------|
| `SUPABASE_URL` | `https://pobrjdrqpzerjlcqnpra.supabase.co` |
| `SUPABASE_ANON_KEY` | Chiave **anon public** da [Supabase](https://supabase.com/dashboard/project/pobrjdrqpzerjlcqnpra/settings/api) |

Dopo un push, verifica con **Actions → Supabase Keepalive → Run workflow**.

### Riattivazione automatica se il progetto va comunque in pausa

Il ping da solo può solo **prevenire** la pausa, non risvegliare un progetto
già sospeso (serve la Management API di Supabase, non la REST API del DB).
Per farlo fare in automatico al workflow, aggiungi anche questo secret:

| Nome | Valore |
|------|--------|
| `SUPABASE_ACCESS_TOKEN` | Personal Access Token Supabase |

Come generarlo:
1. Vai su [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) (icona profilo → Account → Access Tokens).
2. **Generate new token**, dagli un nome (es. "badgeapp-keepalive"), copialo (mostrato una sola volta).
3. In GitHub: repo → Settings → Secrets and variables → Actions → **New repository secret** → nome `SUPABASE_ACCESS_TOKEN`, incolla il valore.

⚠️ È un token personale con accesso di gestione al tuo account Supabase
(non solo a questo progetto): trattalo come una password, non committarlo
mai nel codice. Senza questo secret il workflow continua a funzionare come
ping preventivo; se il progetto va comunque in pausa, il job fallisce con
un errore che ti dice di riattivarlo a mano dalla dashboard.

## Publish mobile OTA — configurato e verificato (2026-10-09)

Il sito web NON usa secret GitHub: Netlify è collegato al repo via integrazione
Git nativa e fa deploy da solo (nessun `NETLIFY_AUTH_TOKEN`/`NETLIFY_SITE_ID`
necessario in CI).

Il workflow **Publish mobile OTA** (`.github/workflows/publish-mobile-ota.yml`)
gira automaticamente a ogni push su `main` che tocca `badgeapp-mobile/` e
pubblica davvero: primo OTA reale pubblicato con successo (branch
`production`, runtime `1.1.0`, android+ios —
[dashboard](https://expo.dev/accounts/nalettonicolo/projects/badgeapp-mobile/updates/1fe96885-4c32-46f9-a5ec-571559fb7674)).

Stato attuale:
- Progetto EAS: `@nalettonicolo/badgeapp-mobile`, Project ID
  `d80ac4ac-b39e-420f-a1d2-b13fe4381481` — non è un segreto (pubblico
  nell'URL del progetto), scritto come fallback in
  `badgeapp-mobile/app.config.js` insieme a `expo.updates.url`
  (`https://u.expo.dev/<projectId>`, campo distinto ma ugualmente
  richiesto da EAS Update). Nessun secret GitHub necessario per questo,
  a meno di voler un giorno ruotare su un altro progetto EAS (override
  con il secret `EAS_PROJECT_ID`).
- Secret `EXPO_TOKEN`: configurato su **questo** repository
  (`nalettonicolo/badgeapp-stabile`) — attenzione a non confonderlo con
  altri repository dello stesso account che potrebbero avere un secret
  omonimo (è già successo una volta: il token era stato aggiunto per
  errore su un repo diverso, `CRM-APP`, e il workflow continuava a
  saltare silenziosamente perché il secret semplicemente non esisteva
  qui). Verifica sempre l'URL: deve essere
  `github.com/nalettonicolo/badgeapp-stabile/settings/secrets/actions`.

Per rigenerare/ruotare il token: [expo.dev](https://expo.dev) → icona
profilo → **Account settings** → **Access tokens** → **Create token**,
poi sostituisci il valore dello stesso secret `EXPO_TOKEN` su GitHub.

⚠️ `EXPO_TOKEN` è legato al tuo account Expo: trattalo come una password,
non committarlo mai nel codice.

Per verificare manualmente che la pubblicazione funzioni: **Actions →
Publish mobile OTA → Run workflow**.

## Se il ping fallisce con 502/503/504

Il progetto Supabase free è in pausa: aprilo su [supabase.com/dashboard](https://supabase.com/dashboard/project/pobrjdrqpzerjlcqnpra) e ripristinalo. Il keepalive evita nuove pause, ma non riattiva un progetto già sospeso.
