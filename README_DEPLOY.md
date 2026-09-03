BadgeApp / Timbrature Online — guida deploy

--------------------------------------------------
Struttura del repository
--------------------------------------------------
- index.html, styles.css, js/, supabase-config.js  → sito web (statico, nessuna build)
- SUPABASE_SCHEMA.sql                                → schema/migrazioni DB (Supabase → SQL Editor → Run)
- badgeapp-mobile/                                   → app mobile (Expo / React Native)
- netlify.toml                                       → publish "." (root), nessun build command

--------------------------------------------------
Deploy del sito web
--------------------------------------------------
Il sito è collegato a Netlify via integrazione Git nativa (Netlify → Site
settings → Build & deploy), che legge netlify.toml dalla root del repo:
- ogni push su main → deploy in produzione
- ogni Pull Request → deploy preview automatico con URL dedicato

Non serve alcun comando manuale: build command è vuoto ("nessuna build
richiesta"), publish directory è la root del repo.

Flusso consigliato per non toccare subito la produzione:

git checkout -b feature/nome-modifica
# modifiche...
git add .
git commit -m "feat: ..."
git push -u origin feature/nome-modifica
# apri una Pull Request verso main: Netlify genera un URL di anteprima

Quando pronto, fai merge della PR su main: Netlify fa il deploy in produzione.

--------------------------------------------------
Test automatici
--------------------------------------------------
npm test

Esegue (node --test, nessuna dipendenza da installare per la parte web):
- tests/utils.test.mjs        → unit test delle funzioni pure in js/utils.js
- tests/web-structure.test.mjs → sanity check strutturale di index.html
- tests/mobile-types.test.mjs  → type-check TypeScript di badgeapp-mobile
  (richiede `cd badgeapp-mobile && npm ci` prima; se node_modules manca il
  test viene saltato invece di fallire)

Girano automaticamente su ogni push/Pull Request via
.github/workflows/ci.yml (job separati per web e mobile).

--------------------------------------------------
Database Supabase (obbligatorio per app web + mobile)
--------------------------------------------------
1) Apri il progetto su [Supabase](https://supabase.com) → **SQL Editor**.
2) Incolla tutto il file **`SUPABASE_SCHEMA.sql`** (nella root del repo) ed esegui **Run** una volta.
   - È idempotente: applicabile più volte senza cancellare dati, aggiunge solo
     tabelle/colonne/policy/vincoli mancanti.

--------------------------------------------------
Nota privacy posizione
--------------------------------------------------
La geolocalizzazione è opt-in: nessun dipendente viene tracciato di default.
Chi attiva l'interruttore "Timbra automaticamente l'ingresso mattutino" nella
propria vista timbrature autorizza il browser a leggere la posizione SOLO
mentre quella pagina è aperta (nessun tracciamento in background, nessuna
posizione salvata sul server — solo un confronto locale, sul dispositivo, con
l'area configurata dall'admin) e SOLO per registrare l'ingresso mattutino
quando manca. L'area (poligono) è configurabile dal pannello admin.

--------------------------------------------------
Workaround standby Supabase (Free)
--------------------------------------------------
Workflow già pronto nel repository (gira automaticamente ogni 2 giorni):
- .github/workflows/supabase-keepalive.yml

Configura questi GitHub Secrets in repo > Settings > Secrets and variables > Actions:
- SUPABASE_URL (es. https://xxxx.supabase.co) — opzionale
- SUPABASE_ANON_KEY — opzionale
- SUPABASE_ACCESS_TOKEN — opzionale, ma senza questo il workflow può solo
  segnalare che il progetto è in pausa, non riattivarlo da solo (vedi sotto)

Poi avvia un test manuale:
- Actions > Supabase Keepalive > Run workflow

Nota:
- È un workaround, non una garanzia "always on" del free tier.
- Il ping da solo previene la pausa ma non può risvegliare un progetto già
  pausato (serve la Management API di Supabase, non la REST API del DB).
  Con il secret SUPABASE_ACCESS_TOKEN (Personal Access Token, vedi
  .github/GITHUB_SECRETS.md per come generarlo) il workflow prova anche a
  riattivarlo automaticamente quando lo trova in pausa.
