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

## Publish mobile OTA (opzionale)

Il sito web NON usa secret GitHub: Netlify è collegato al repo via integrazione
Git nativa e fa deploy da solo (nessun `NETLIFY_AUTH_TOKEN`/`NETLIFY_SITE_ID`
necessario in CI).

| Nome | Uso |
|------|-----|
| `EXPO_TOKEN` | Publish OTA Expo |
| `EAS_PROJECT_ID` | Opzionale, UUID progetto Expo |

## Se il ping fallisce con 502/503/504

Il progetto Supabase free è in pausa: aprilo su [supabase.com/dashboard](https://supabase.com/dashboard/project/pobrjdrqpzerjlcqnpra) e ripristinalo. Il keepalive evita nuove pause, ma non riattiva un progetto già sospeso.
