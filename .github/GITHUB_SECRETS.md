# Secret GitHub Actions (badgeapp-stabile)

Configura in **Settings → Secrets and variables → Actions → Repository secrets**:

| Nome | Valore |
|------|--------|
| `SUPABASE_URL` | `https://pobrjdrqpzerjlcqnpra.supabase.co` |
| `SUPABASE_ANON_KEY` | Chiave **anon public** da [Supabase](https://supabase.com/dashboard/project/pobrjdrqpzerjlcqnpra/settings/api) |

Workflow che li usano:

- **Supabase Keepalive** — ping ogni 6 giorni (evita pausa progetto free)
- **Publish web + mobile OTA** (opzionale): `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`, `EXPO_TOKEN`

Dopo aver aggiunto i secret, vai su **Actions → Supabase Keepalive → Run workflow** per verificare che il job `ping` sia verde.
