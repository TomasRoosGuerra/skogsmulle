# Bildplatser (swappa bilder här)

Alla bilder på sajten ligger i `assets/images/`. För att byta en bild: behåll filnamnet och ersätt filen
(ev. flera bredder, se nedan). Alla bilder är akvarell i stilen från `igelkotten.png`; AI-genererade bilder ska märkas så.

| Mapp | Fil | Används som |
|---|---|---|
| `hero/` | `hero-kust-1280.webp` / `-768` / `-480` / `-mobil-crop` | sidhuvud (hjälte), tom yta uppe till vänster för rubriken |
| `backgrounds/` | `bakgrund-papper-1280` / `-768` | lugn pappersbakgrund (textsidor, läsvy) |
| `backgrounds/` | `bakgrund-skog-mobil-720` / `-405` | mobilbakgrund (granskog i dis) |
| `icons/` | `ikon-segelbat`, `ikon-stuga`, `ikon-lov`, `ikon-manen`, `ikon-ekollon`, `ikon-svamp` (192×192 webp, kräm bakgrund) | ämneskort/kategorier (mappning i `site-config.js`, `CATEGORY_ICONS`) |
| `decor/` | `dekorationer-ark.webp` | ark med klistermärkesliknande skogsdekorationer (ej utklippta) |
| `illustrations/` | `igelkotten-1200` / `-600` | stor akvarell (delningsbild/illustration) |
| `story/` | (tom) | bilder som Tomas vill använda i berättelser (välj i författarverktyget) |

Namnregel: `<typ>-<motiv>[-<bredd>].webp`, gemener, inga mellanslag. Nya filer: lägg dem i rätt mapp och (för berättelsebilder)
lägg till raden i `assets/images/story/manifest.json`.
