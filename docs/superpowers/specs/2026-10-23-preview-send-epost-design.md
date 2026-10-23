# Preview + «Send direkte på e-post» — design

**Dato:** 2026-10-23
**App:** dommerbetaling (Sandnes IBK refusjonsskjema), statisk GitHub Pages-side, ingen build.

## Mål
La brukeren forhåndsvise PDF-en og sende den på e-post med **PDF-en allerede vedlagt**, slik at
mobilbrukere slipper å finne fila igjen i «Filer». Ingen backend.

## Harde begrensninger (avklart)
- `mailto:` kan **ikke** vedlegge filer → forkastet.
- Web Share API kan **ikke** forhåndsutfylle mottaker → derfor vises mottaker bare som info.
- «Last ned» gir inkonsekvent forhåndsvisning (iOS viewer vs. Android lagrer i Filer) → egen
  innebygd «Forhåndsvis» i stedet.
- Backend (Supabase Edge Function + e-posttjeneste) vurdert og **forkastet** (unødvendig når
  Web Share vedlegger PDF-en).

## Løsning
Web Share API (`navigator.share({ files: [...] })`) vedlegger PDF-en i delingsarket; brukeren
velger Mail og sender. Mottaker (`kasserer@sandnesibk.no`) vises som fast, kopierbar info.

## UI
To toppnivå-knapper (erstatter dagens «Last ned PDF →»):
- **«Forhåndsvis»** → åpner overlay med PDF i `<iframe>`. Overlay inneholder:
  **«Send direkte på e-post»**, **«Last ned»**, **«Lukk»**.
- **«Send direkte på e-post»** → Web Share med PDF vedlagt.

Fast mottaker-linje: `kasserer@sandnesibk.no` + **«Kopier»**-knapp (clipboard). Ikke redigerbar.

## app.js
- `buildPdf()` — trekkes ut fra `generateAndSend()`; validerer (`validateForm()`), bygger
  dokumentet (uendret innhold) og returnerer `{ blob, fname }`.
- `downloadPdf(blob, fname)` — dagens nedlastingslogikk (blob → `<a download>`).
- `openPreview()` — `buildPdf()` → vis overlay med `iframe.src = blobUrl`.
- `closePreview()` — skjul overlay, `URL.revokeObjectURL` på forrige blobUrl.
- `sharePdf()` — `buildPdf()` → `new File([blob], fname, {type:'application/pdf'})` →
  `navigator.share({ files, title, text })`. `text` inkluderer «Til: kasserer@sandnesibk.no …».
- `copyRecipient()` — kopierer adressen (med `window.prompt`-fallback som i `Copy all`-mønsteret
  ved manglende `navigator.clipboard`).

## Feilhåndtering / robusthet
- Validering før både preview og send (gjenbruk `validateForm()`).
- Web Share ikke støttet (`!navigator.canShare?.({files:[testfil]})`): «Send direkte på e-post»
  faller tilbake til nedlasting + toast «Nettleseren støtter ikke direkte deling – PDF-en er
  lastet ned, legg den ved manuelt» + viser kopierbar adresse.
- Bruker avbryter delingsarket → `navigator.share` kaster `AbortError` → svelges stille (ingen
  feil-toast).
- `revokeObjectURL` ryddes når overlay lukkes og før ny preview/deling (ingen blob-lekkasje).

## Filer
- `index.html` — to nye knapper, mottaker-linje m/kopier, skjult preview-overlay.
- `styles.css` — overlay/modal i mørk/gul Sandnes IBK-profil, iframe i full bredde.
- `app.js` — refaktor + nye funksjoner over.

## Utelatt (YAGNI)
Backend/direkte server-sending, mailto, redigerbar/innlåst mottaker, domeneverifisering.
