# Catalogo Unificato Skill - Nicolò HQ (100% Open Source / Free Stack)

## A. Grafica, Motion & Vettoriali
- **Colori & Superfici:** Palette in spazio OKLCH, dual-theme nativo, glassmorphism calibrato (`backdrop-blur-md` + bordo superiore luminoso).
- **Fisica del Movimento:** Transizioni spring tramite `framer-motion` o `gsap`, `layoutId` per tab attive, feedback tattile al click (`scale: 0.97`).
- **SVG & Tipografia:** Loghi e icone esclusivamente in SVG pulito (ottimizzato con `svgo`) + icone Lucide/Phosphor. Font tabellare (`tabular-nums`) per dati e metriche.

## B. Sicurezza & Rete Zero-Trust
- **Secret Shield:** Blocco commit via Gitleaks/TruffleHog se presenti chiavi API in chiaro.
- **Tailscale Only:** Tutti i servizi esposti solo su `127.0.0.1` o interfaccia Tailscale. Validazione input rigorosa con Zod / Pydantic.

## C. Database Multi-Engine (SQLite, PostgreSQL, MySQL, MongoDB, Redis)
- **SQLite:** Attivare sempre `PRAGMA journal_mode = WAL;` per evitare lock concorrenti.
- **Migrazioni & Sicurezza:** Vietate operazioni distruttive (`DROP`, `TRUNCATE`) senza rollback testato e approvazione umana. Isolamento multi-tenant obbligatorio e query validate con `EXPLAIN`.

## D. Multilingua (i18n First) & R&D
- **i18n:** Zero stringhe hardcoded; uso di `i18next` + Tolgee self-hosted e stress-test layout in lingua tedesca (+30% lunghezza).
- **R&D Notturno:** Scouting automatico via SearXNG + Crawl4AI filtrando solo licenze open-source (MIT/Apache 2.0/GPL) o piani free reali.
