# IFC Offline Viewer

Detta projekt laddar, renderar och exporterar IFC-modeller med full metadata.

## Installera

```bash
npm install
```

Detta kopierar automatiskt `web-ifc.wasm` till `public/wasm/` via `postinstall`.

## Starta dev-server

```bash
npm run dev
```

## Publicera online (GitHub Pages)

Detta repo är förberett för GitHub Pages på:

`https://stni25xr.github.io/IFC_reader/`

### Steg

1. Pusha till `main`.
2. Gå till GitHub → **Settings** → **Pages**.
3. Under **Build and deployment**, välj **GitHub Actions**.
4. Vänta tills workflowen **Deploy to GitHub Pages** är klar.

## Ladda en IFC

1. Dra och släpp en `.ifc`-fil i drop-zonen, eller klicka på **Välj IFC-fil**.
2. Modellen renderas i 3D-viewern.
3. Klicka på objekt i modellen eller i listan för att se **alla** IFC-parametrar.

## Exportera HTML (offline, ZIP-bundle)

Exporten skapar en **ZIP-bundle** som fungerar offline och innehåller:
- `viewer.html`
- `bundle.json`
- `models/*.ifc`
- `wasm/web-ifc.wasm`

### Förbered exportbundlen

Exportfunktionen inlinar en bundlad viewer i den fristående HTML-filen. Kör en gång:

```bash
npm run build:export
```

Detta skapar `public/export-bundle.js`.

### Export

1. Ladda en eller flera IFC i appen.
2. Klicka **Exportera HTML**.
3. En fil `ifc-offline-viewer.zip` laddas ner.

### Öppna exporten

1. Packa upp ZIP-filen.
2. Starta en lokal server i den uppackade mappen:

```bash
npx serve
```

3. Öppna:

```
http://localhost:3000/viewer.html
```

## Viktigt om wasm

Exporten kräver `public/wasm/web-ifc.wasm`. Om den saknas:

```bash
npm run postinstall
```

## Metadata i export

Export-viewern hämtar metadata **on-demand** när du klickar på ett element.
Detta gör att även stora IFC-filer fungerar utan minnesfel.
