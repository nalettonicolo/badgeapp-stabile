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

## Branding / design (decisione di prodotto, non tecnica)

- [ ] **Icona PWA/favicon** (`icons/*.png`, Fase 5): generata come placeholder
  (badge indigo con un semplice glifo a orologio, colori presi da
  `styles.css`) perché `badgeapp-mobile/assets/icon.png` è ancora il
  template di default di Expo (la griglia guida mai sostituita con un logo
  vero) e non era utilizzabile. Se esiste un logo reale, sostituire i file
  in `icons/` (192, 512, 512 maskable, favicon 32) mantenendo gli stessi nomi.
- [ ] **Icona app mobile**: `badgeapp-mobile/assets/icon.png`,
  `adaptive-icon.png`, `splash-icon.png` sono ancora il placeholder Expo di
  default — finiranno così anche sugli store se non sostituiti prima della
  pubblicazione.

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
