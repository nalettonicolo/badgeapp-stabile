# Regole Operative Globali - Nicolò HQ

## 1. Gerarchia di Esecuzione (Doppio Binario & Risparmio Claude)
- **Esecuzione Codice (`role-coder`):** Affidata di default a FreeLLMAPI (`auto:smart`) con failover sulle chiavi personali dirette NVIDIA NIM / Google AI Studio, sempre dentro `git worktree` isolati.
- **UI & Visual QA (`role-vision-ui`):** Modelli Vision gratuiti + Playwright headless per controllo screenshot prima di chiudere il task.
- **Contorno, Smistamento & Telegram (`role-fast-worker`):** FreeLLMAPI (`auto:fast`) o Ollama/Jarvis locale sull'MSI. Haiku disattivato.
- **Contesti Pesanti & i18n:** Chiave diretta Google AI Studio (Gemini).
- **Security & Dati Privati:** Ollama/Jarvis locale sull'MSI.
- **Supervisione (`role-architect` -> Claude Code):** Interviene SOLO per scrivere `TASK_PLAN.md` e per revisionare il solo `git diff` dopo il via libera dell'Officina.

## 2. Regole Tassative
- **Git:** Mai commit su `main`. Nessun merge automatico.
- **Officina:** Obbligatori `Semgrep`, `npm audit` / `pip-audit` e test prima della review.
- **Notifiche:** Log silenziosi su Ntfy; su Telegram solo Digest (13:00 e 19:00) o richieste approvazione critica con bottoni (silenzio 21:30 - 07:00).

## 3. Modalità Resiliente (Circuit Breaker + Locale-First)
- **Coda sequenziale & Circuit Breaker:** 1 solo task alla volta, con 8 secondi tra un avvio e l'altro. Con HTTP 429 (o 402, 403, 502, 503) il fornitore va in pausa automatica per 15 minuti e si passa subito al successivo, fino all'Ollama locale sull'MSI, che non va mai in pausa.
- **Dieta dei token (max 60 righe):** dei file lunghi si mandano ai modelli solo le parti intorno alle funzioni indicate nel piano (60 righe per pezzo); i file corti interi.
- **Gate deterministico prima dell'AI:** linter, controllo dei tipi e Semgrep girano in locale prima della revisione; se falliscono, il modello che ha scritto corregge prima che venga chiamato il revisore.
- **Verifica incrociata:** il modello che verifica il diff o il documento è diverso da quello che l'ha scritto.
