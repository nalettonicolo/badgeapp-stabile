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

## Note

Aggiungere qui altri item mano a mano che emergono durante il lavoro di
irrobustimento ("enterprise hardening") in corso sul repo.
