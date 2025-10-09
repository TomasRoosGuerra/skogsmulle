# 🌲 Skogsmulle - Svenska Barnböcker Online

En professionell, SEO-optimerad plattform för svenska barnberättelser och sagor. Upptäck Skogsmulles magiska värld med underbara berättelser för barn 3-12 år.

## ✨ Funktioner

### För Besökare

- 📖 **Individuella Berättelsesidor**: Varje berättelse har sin egen URL för delning
- 🎨 **Magisk Design**: Vackert gränssnitt inspirerat av barnboksillustrationer
- 🎵 **Ljudupplevelse**: Spela Skogsmulle-låtar medan du läser
- 📱 **Responsiv**: Fungerar perfekt på alla enheter
- 🔍 **Lätt att Hitta**: Sök efter kategori (äventyr, vänskap, natur, etc.) och ålder
- 📤 **Enkel Delning**: Dela berättelser via sociala medier
- 🖨️ **Utskriftsvänlig**: Skriv ut berättelser för offline-läsning
- ♿ **Tillgänglig**: WCAG-kompatibel med ARIA-stöd

### För Författare

- ✍️ **Rich Text Editor**: Formatera text med fet, kursiv, listor och bilder
- 💾 **Utkast-system**: Spara utkast och återuppta senare
- 🗑️ **Ångra-funktion**: 10 sekunders ångrafönster vid radering
- 🏷️ **Kategorisering**: Organisera berättelser efter tema och ålder
- 🔐 **Säker Inloggning**: E-postbaserad autentisering

### SEO & Teknik

- 🔍 **SEO-Optimerad**: Omfattande meta tags och Schema.org strukturerad data
- 🗺️ **XML Sitemap**: Automatisk sitemap-generering
- 🤖 **Robots.txt**: Korrekt konfiguration för sökmotorer
- 📊 **Strukturerad Data**: Article, BreadcrumbList, WebSite schemas
- 🚀 **Snabb**: Optimerad prestanda med CDN och caching
- 🌐 **Internationalisering**: Redo för svenska sökmotorer

## 🚀 Installation

### Snabbstart

```bash
# Klona repositoryt
git clone https://github.com/TomasRoosGuerra/skogsmulle.git
cd skogsmulle

# Installera beroenden (valfritt, för build-script)
npm install

# Kör lokal server
npm run dev
# eller
python -m http.server 8000
```

### Deployment till Netlify

```bash
# 1. Skapa ett nytt projekt på Netlify
# 2. Koppla till ditt GitHub-repo
# 3. Netlify bygger automatiskt med: npm run build
# 4. Sidan publiceras på: https://din-site.netlify.app
```

### Manuell Deployment

```bash
# Generera berättelsesidor
npm run generate-pages

# Bygg för produktion
npm run build
```

## 📂 Filstruktur

```
skogsmulle/
├── index.html              # Huvudsida med alla berättelser
├── stories/                # Genererade individuella berättelsesidor
│   └── {slug}.html        # SEO-optimerad berättelsesida
├── robots.txt             # Sökmotordirektiv
├── sitemap.xml            # XML sitemap för sökmotorer
├── generate-pages.js      # Script för att generera berättelsesidor
├── package.json           # NPM-konfiguration och build-scripts
├── netlify.toml           # Netlify-konfiguration med headers
├── SEO-IMPROVEMENTS.md    # Detaljerad SEO-dokumentation
├── USER-GUIDE.md          # Användarguide på svenska
├── README.md              # Denna fil
├── Skogsmulle.mp3         # Temalåt
├── telegram_audio.mp3     # Äventyrslåt
└── *.png                  # Bilder och illustrationer
```

## 🎯 SEO-funktioner

### Meta Tags

- ✅ Omfattande titel- och beskrivningstaggar
- ✅ Open Graph för sociala medier
- ✅ Twitter Cards
- ✅ Språk- och geo-targeting (sv-SE, Sverige)
- ✅ Canonical URLs

### Strukturerad Data

- ✅ **WebSite Schema**: Huvudsideinformation
- ✅ **Article Schema**: Individuella berättelser
- ✅ **BreadcrumbList**: Navigationsstruktur
- ✅ **ItemList**: Berättelsesamling

### Teknisk SEO

- ✅ Semantisk HTML5 (article, nav, main, section)
- ✅ Korrekt heading-hierarki (H1-H3)
- ✅ Alt-text för bilder
- ✅ Mobile-first design
- ✅ Fast page load (optimerad för Core Web Vitals)

Se [SEO-IMPROVEMENTS.md](SEO-IMPROVEMENTS.md) för detaljer.

## 🔐 Admin-funktioner

### Logga In

1. Klicka på "Logga in" i övre högra hörnet
2. Ange e-post: `tomas.roosguerra@gmail.com` eller `tomasroosguerra@gmail.com`
3. Endast dessa e-postadresser har admin-rättigheter

### Skapa Berättelser

1. Öppna hamburgermenyn (☰)
2. Välj "Författarverktyg"
3. Fyll i titel, kategori, åldersgrupp och berättelse
4. Använd rich text-editorn för formatering
5. Spara som utkast eller publicera direkt

### Redigera/Ta Bort

- **Redigera**: Klicka på "✏️ Redigera" på berättelseskortet
- **Ta bort**: Klicka på "🗑️ Ta bort" (10 sekunders ångrafönster!)

Se [USER-GUIDE.md](USER-GUIDE.md) för detaljerad användarguide.

## 🛠️ Teknisk Stack

### Frontend

- **HTML5**: Semantisk markup
- **CSS3**: Custom properties, flexbox, grid, animations
- **JavaScript ES6+**: Async/await, modules, arrow functions

### Backend & Lagring

- **Firebase Firestore**: Realtidsdatabas för berättelser
- **LocalStorage**: Utkast och användarpreferenser

### Build & Deploy

- **Node.js**: Build scripts (valfritt)
- **Netlify**: Automatisk deployment med CDN
- **Git**: Versionskontroll

### SEO Tools

- **Schema.org**: Strukturerad data
- **Open Graph**: Social media optimization
- **Sitemap.xml**: Sökmotorindexering

## 📊 Utveckling

### Skript

```bash
npm run dev              # Starta lokal server
npm run generate-pages   # Generera berättelsesidor
npm run build           # Bygg för produktion
npm run deploy          # Förbered för deployment
```

### Firebase-konfiguration

Firebase-konfigurationen finns i `index.html`. För att använda din egen Firebase-databas:

1. Skapa ett projekt på [Firebase Console](https://console.firebase.google.com)
2. Aktivera Firestore Database
3. Uppdatera `firebaseConfig` i index.html med dina uppgifter

### Utvecklingsmiljö

```bash
# Rekommenderade verktyg
- VSCode med extensions: Live Server, Prettier
- Chrome DevTools för debugging
- Lighthouse för SEO/Performance audit
```

## 📈 SEO-checklista

- [x] Comprehensive meta tags
- [x] Open Graph och Twitter Cards
- [x] Schema.org strukturerad data
- [x] Robots.txt och sitemap.xml
- [x] Individuella sidor för varje berättelse
- [x] Breadcrumb-navigation
- [x] Mobile-responsive design
- [x] Fast page load (<3s)
- [x] Semantic HTML
- [x] Alt-text för bilder
- [x] Canonical URLs
- [x] HTTPS (via Netlify)

### Nästa Steg

- [ ] Submit sitemap till Google Search Console
- [ ] Konfigurera Google Analytics
- [ ] Lägg till Bing Webmaster Tools
- [ ] Implementera AMP-sidor
- [ ] Progressive Web App funktionalitet

## 🌍 Målgruppsoptimering

### Primära Nyckelord

- svenska sagor
- barnböcker online
- barnberättelser
- sagor för barn
- svenska barnböcker
- gratis sagor
- godnattsagor

### Geografisk Målgrupp

- 🇸🇪 Sverige (primär)
- 🇫🇮 Finland (svensk-talande)
- Andra svenska språkområden

## 📱 Browser-stöd

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Mobile browsers (iOS/Android)

## 🤝 Bidra

Vill du bidra? Kontakta:

- **E-post**: tomas.roosguerra@gmail.com
- **GitHub**: [github.com/TomasRoosGuerra/skogsmulle](https://github.com/TomasRoosGuerra/skogsmulle)

## 📄 Licens

© 2025 Skogsmulle - Alla berättelser skapade med kärlek för barn och föräldrar.

## 🆘 Support

### Vanliga Problem

- **Berättelser laddas inte**: Kontrollera internetanslutning och Firebase-status
- **Kan inte logga in**: Verifiera e-postadress är korrekt
- **Sidan laddas långsamt**: Rensa webbläsarens cache

### Hjälp-resurser

- [USER-GUIDE.md](USER-GUIDE.md) - Komplett användarguide
- [SEO-IMPROVEMENTS.md](SEO-IMPROVEMENTS.md) - SEO-dokumentation
- [GitHub Issues](https://github.com/TomasRoosGuerra/skogsmulle/issues) - Rapportera buggar

## 🎓 Läs Mer

- **Schema.org**: https://schema.org/
- **Google Search Central**: https://developers.google.com/search
- **Firebase Docs**: https://firebase.google.com/docs
- **Netlify Docs**: https://docs.netlify.com

---

**🌟 Tack för att du använder Skogsmulle!**

_Skapad med ❤️ för svenska barn och deras familjer_

_Senast uppdaterad: Oktober 2025 | Version 2.0.0_
