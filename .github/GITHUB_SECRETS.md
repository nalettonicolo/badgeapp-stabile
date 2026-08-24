# Secret GitHub Actions (badgeapp-stabile)

## Supabase Keepalive

Il workflow **Supabase Keepalive** funziona anche **senza secret**: usa i default pubblici del progetto Timbrature Online già presenti in `index.html`.

Secret **opzionali** (Settings → Secrets and variables → Actions → Repository secrets), solo se vuoi override:

| Nome | Valore |
|------|--------|
| `SUPABASE_URL` | `https://pobrjdrqpzerjlcqnpra.supabase.co` |
| `SUPABASE_ANON_KEY` | Chiave **anon public** da [Supabase](https://supabase.com/dashboard/project/pobrjdrqpzerjlcqnpra/settings/api) |

Dopo un push, verifica con **Actions → Supabase Keepalive → Run workflow**.

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
