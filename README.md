# Skogsmulle - Barnboksblogg

En vacker och lekfull barnboksblogg inspirerad av Astrid Lindgrens värld, med Skogsmulle som huvudkaraktär.

## Funktioner

- 🎨 **Whimsical Design**: Pastellfärger och mjuka former inspirerade av barnboksillustrationer
- 🎵 **Audio Player**: Spela Skogsmulle-låtar direkt på sidan
- 📝 **Bloggfunktioner**: Skapa, redigera och ta bort berättelser
- 🔐 **Admin-inloggning**: Säker inloggning för att redigera innehåll
- 💾 **Lokal lagring**: Alla berättelser sparas lokalt i webbläsaren
- 📱 **Responsiv design**: Fungerar på alla enheter

## Teknisk information

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Lagring**: LocalStorage för persistering
- **Autentisering**: Enkel Gmail-baserad inloggning
- **Deployment**: Netlify-ready med automatisk deployment

## Installation och körning

1. Klona repositoryt:
```bash
git clone https://github.com/TomasRoosGuerra/skogsmulle.git
cd skogsmulle
```

2. Öppna `index.html` i en webbläsare eller kör en lokal server:
```bash
python -m http.server 8000
# eller
npx serve .
```

## Admin-funktioner

För att få tillgång till admin-funktioner (redigera/ta bort inlägg):
1. Klicka på "Logga in med Google" i sidebar
2. Ange din Gmail-adress
3. Endast `tomasroosguerra@gmail.com` har admin-rättigheter

## Deployment på Netlify

1. Gå till [Netlify](https://netlify.com)
2. Koppla ditt GitHub-repository
3. Netlify kommer automatiskt att deploya från `main`-branchen
4. Sidan kommer att vara tillgänglig på en Netlify-URL

## Filstruktur

```
skogsmulle/
├── index.html              # Huvudfil med all HTML, CSS och JavaScript
├── Skogsmulle.mp3         # Huvudlåt
├── telegram_audio.mp3     # Äventyr-låt
├── skogsmulle och gänget.png # Header-bild
├── netlify.toml           # Netlify-konfiguration
└── README.md              # Denna fil
```

## Utveckling

Sidan är byggd som en Single Page Application (SPA) med all funktionalitet i en enda HTML-fil för enkelhet. Alla stilar och JavaScript är inbäddade för att göra deployment så enkel som möjligt.

## Licens

© 2023 Skogsmulle - Alla äventyr är våra egna
