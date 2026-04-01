# BadgeApp Mobile - pubblicazione con costi minimi

## Stack senza servizi a pagamento obbligatori
- Backend: Supabase Free (gia in uso)
- Mobile framework: Expo (gratis)
- Build cloud: EAS Build Free tier (limiti mensili)
- Test distribuzione Android: APK internal (`eas build --profile preview --platform android`)
- Test distribuzione iOS: TestFlight (richiede Apple Developer Program)

## Cosa e davvero gratis
- Sviluppo e test locale Android/iOS con Expo Go: gratis
- Build Android con EAS Free: gratis entro quota
- Pubblicazione Play Store: account Google Play Console a pagamento una tantum
- Pubblicazione App Store iOS: Apple Developer Program annuale

## Flusso consigliato (pratico)
1. Test continuo con Expo Go (`npm start`)
2. Build preview Android:
   - `eas build --profile preview --platform android`
3. Installa APK e valida login/timbrature/geofence
4. Quando stabile:
   - `eas build --profile production --platform android`
   - `eas build --profile production --platform ios`
5. Invio store:
   - `eas submit --platform android`
   - `eas submit --platform ios`

## Variabili ambiente richieste
- `EXPO_PUBLIC_SUPABASE_URL` — es. `https://pobrjdrqpzerjlcqnpra.supabase.co` (Timbrature Online, stesso del sito web)
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — copia da Supabase Dashboard → Project Settings → API → **anon public** (non la service role)

Impostale su EAS:
- `eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value ...`
- `eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value ...`

I fallback in `app.config.js` puntano già al progetto Timbrature Online; usa le variabili sopra solo se ruoti le chiavi su Supabase.

## Nota importante
Nessun servizio terzo a pagamento e richiesto per l'app in se.
I costi obbligatori arrivano solo al momento della pubblicazione sugli store ufficiali.

## Pubblicazione automatica (consigliato)
Con il repository su GitHub, il workflow `.github/workflows/publish-web-and-mobile.yml` a ogni push su `main`/`master` (cartelle web o mobile):

1. **Netlify** — deploy in produzione della cartella `BadgeApp_stabile_netlify` (richiede i secret `NETLIFY_AUTH_TOKEN` e `NETLIFY_SITE_ID`).
2. **EAS Update** — pubblica un aggiornamento OTA del JavaScript su Expo (richiede `EXPO_TOKEN`; opzionale `EAS_PROJECT_ID` se usi la stessa variabile in `app.config.js`).

Configura Netlify collegando il repo oppure solo i secret sopra. Per la prima volta sull’app mobile: `cd badgeapp-mobile && npx eas init`, poi un build store (`eas build`) con canale `production`; gli OTA successivi arrivano con `npm run publish:ota` o con il workflow CI.

Variabili EAS per le build cloud restano quelle già indicate (`EXPO_PUBLIC_SUPABASE_*`).
