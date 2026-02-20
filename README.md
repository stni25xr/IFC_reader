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

## Ladda en IFC

1. Dra och släpp en `.ifc`-fil i drop-zonen, eller klicka på **Välj IFC-fil**.
2. Modellen renderas i 3D-viewern.
3. Klicka på objekt i modellen eller i listan för att se **alla** IFC-parametrar.

## Exportera HTML (offline)

Exporten skapar en enda `.html`-fil som fungerar offline och innehåller:
- 3D-viewer
- Samtliga IFC-element
- Alla parametrar per element (kopplade till GlobalId)

### Förbered exportbundlen

Exportfunktionen inlinar en bundlad viewer i den fristående HTML-filen. Kör en gång:

```bash
npm run build:export
```

Detta skapar `public/export-bundle.js`.

### Export

1. Ladda en IFC i appen.
2. Klicka **Exportera HTML**.
3. En fil `ifc-offline-viewer.html` laddas ner och fungerar helt offline.

## Viktigt om wasm

Exporten kräver `public/wasm/web-ifc.wasm`. Om den saknas:

```bash
npm run postinstall
```

## Datamodell i export

Exportfilen innehåller:

```js
window.IFC_DATA = {
  GlobalId: {
    expressID: 123,
    ifcType: "IfcWall",
    attributes: {...},
    psets: {...},
    qtos: {...},
    materials: {...},
    type: {...},
    relations: {...},
    spatial: [...]
  }
}
```

All metadata bevaras utan filtrering.
