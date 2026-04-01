BadgeApp stabile - guida deploy GitHub + Netlify

Contenuto della cartella:
- index.html, supabase-config.js, netlify.toml

--------------------------------------------------
Database Supabase (obbligatorio per app web + mobile)
--------------------------------------------------
1) Apri il progetto su [Supabase](https://supabase.com) → **SQL Editor**.
2) Incolla tutto il file **`SUPABASE_SCHEMA.sql`** (in questa cartella) ed esegui **Run** una volta.
   - È idempotente: aggiunge tabelle/colonne/policy mancanti senza cancellare dati.
   - Risolve errori tipo *column employee_requests.travel_hours does not exist* su DB creati con migrazioni vecchie.

--------------------------------------------------
STEP 1 - Crea repository GitHub
--------------------------------------------------
1) Vai su GitHub e crea un nuovo repo, ad esempio: badgeapp-stabile
2) Non aggiungere README/.gitignore dal sito (repo vuoto)

--------------------------------------------------
STEP 2 - Inizializza repo locale in questa cartella
--------------------------------------------------
Apri terminale dentro BadgeApp_stabile_netlify e lancia:

git init
git add .
git commit -m "Initial stable release"
git branch -M main
git remote add origin https://github.com/nalettonicolo/badgeapp-stabile
git push -u origin main

--------------------------------------------------
STEP 3 - Collega Netlify a GitHub
--------------------------------------------------
1) Netlify > Add new site > Import an existing project
2) Scegli GitHub e autorizza
3) Seleziona il repo badgeapp-stabile
4) Build settings:
   - Build command: (vuoto)
   - Publish directory: .
5) Deploy site

--------------------------------------------------
STEP 4 - Flusso consigliato (meno deploy inutili)
--------------------------------------------------
Per lavorare senza toccare subito la produzione:

git checkout -b develop

Fai modifiche, poi:

git add .
git commit -m "feat: ... "
git push -u origin develop

Quando pronto per produzione:

git checkout main
git merge develop
git push origin main

Netlify farà deploy produzione solo quando aggiorni main.

--------------------------------------------------
STEP 5 - Deploy preview opzionale
--------------------------------------------------
Se vuoi preview automatiche:
- Apri Pull Request da develop -> main su GitHub
- Netlify genera Preview URL
- Dopo test, fai merge

--------------------------------------------------
Geotimbratura automatica (appena integrata)
--------------------------------------------------
Nel file index.html trovi:
- pulsante: "Attiva Timbratura Automatica da Posizione"
- oggetto configurazione: GEOFENCE_CONFIG

Prima dell'uso imposta coordinate reali sede:
- centerLat
- centerLng
- radiusEntryMeters
- radiusExitMeters

Se centerLat/centerLng restano 0, la funzione non parte (blocco di sicurezza).

--------------------------------------------------
Workaround standby Supabase (Free)
--------------------------------------------------
Workflow già pronto nel repository:
- .github/workflows/supabase-keepalive.yml

Configura questi GitHub Secrets in repo > Settings > Secrets and variables > Actions:
- SUPABASE_URL (es. https://xxxx.supabase.co)
- SUPABASE_ANON_KEY

Poi avvia un test manuale:
- Actions > Supabase Keepalive > Run workflow

Nota:
- È un workaround, non una garanzia "always on" del free tier.
