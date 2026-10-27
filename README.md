# 🌲 Skogsmulle - Svenska Barnböcker Online

En professionell, SEO-optimerad plattform för svenska barnberättelser och sagor. Upptäck Skogsmulles magiska värld med underbara berättelser för barn 3-12 år.

**🌐 Live Site**: https://skogsmulle.netlify.app

## 📖 Innehållsförteckning

- [Funktioner](#-funktioner)
- [Snabbstart](#-snabbstart)
- [Filstruktur](#-filstruktur)
- [Användarguide](#-användarguide)
- [Utveckling](#-utveckling)
- [SEO](#-seo)
- [Teknisk Stack](#-teknisk-stack)
- [Support](#-support)

## ✨ Funktioner

### För Besökare

- 📖 **Individuella Berättelsesidor**: Varje berättelse har sin egen URL
- 🎨 **Magisk Design**: Vackert gränssnitt inspirerat av barnboksillustrationer
- 🎵 **Ljudupplevelse**: Spela Skogsmulle-låtar medan du läser
- 📱 **Responsiv**: Fungerar perfekt på alla enheter
- 🔍 **Filter**: Sök efter kategori och ålder
- 📤 **Delning**: Dela berättelser via sociala medier
- ♿ **Tillgänglig**: WCAG-kompatibel med ARIA-stöd

### För Författare

- ✍️ **Rich Text Editor**: Formatera text med fet, kursiv, listor och bilder
- 💾 **Utkast-system**: Spara utkast och återuppta senare
- 🗑️ **Ångra-funktion**: 10 sekunders ångrafönster vid radering
- 🏷️ **Kategorisering**: Organisera berättelser efter tema och ålder

### SEO & Teknik

- 🔍 **SEO-Optimerad**: Meta tags och Schema.org strukturerad data
- 🗺️ **XML Sitemap**: Automatisk sitemap-generering
- 📊 **Strukturerad Data**: Article, BreadcrumbList, WebSite schemas
- 🚀 **Snabb**: Optimerad prestanda med CDN

## 🚀 Snabbstart

```bash
# Klona repositoryt
git clone https://github.com/TomasRoosGuerra/skogsmulle.git
cd skogsmulle

# Installera beroenden
npm install

# Kör lokal server
npm run dev
```

### Deployment till Netlify

1. Koppla till GitHub-repo på Netlify
2. Build command: `npm run build`
3. Publish directory: `.`
4. Sidan publiceras automatiskt

## 📂 Filstruktur

```
skogsmulle/
├── index.html              # Huvudsida
├── stories/                # Genererade berättelsesidor
├── generate-pages.js       # Genererar berättelsesidor
├── package.json           # NPM-konfiguration
├── netlify.toml           # Netlify-konfiguration
├── robots.txt             # Sökmotordirektiv
├── sitemap.xml            # XML sitemap
├── README.md              # Denna fil
└── *.png, *.mp3          # Bilder och ljud
```

## 👤 Användarguide

### Logga In (Författare)

1. Klicka på "Logga in" i övre högra hörnet
2. Ange e-post och lösenord (Firebase Authentication)
3. Endast författarens konto har admin-rättigheter

**OBS:** Inloggning sker nu via Firebase Authentication med e-post och lösenord. Se `docs/SECURITY-TODO.md` för konfigurationsinstruktioner.

### Skriva Berättelser

1. Klicka på hamburgermenyn (☰)
2. Välj "✍️ Författarverktyg"
3. Fyll i:
   - **Titel**: Fängslande titel
   - **Kategori**: äventyr, vänskap, natur, magi, djur, lärdom
   - **Åldersgrupp**: 3-5 år, 6-8 år, 9-12 år, alla åldrar
   - **Berättelse**: Skriv med rich text-editorn
4. Spara utkast eller publicera direkt

### Formatera Text

- **B** - Fet text
- **I** - Kursiv
- **U** - Understruken
- **🖼️** - Lägg till bild (URL)
- **•** - Punktlista

### Redigera/Ta Bort

- **Redigera**: Klicka "✏️ Redigera" på berättelseskortet
- **Ta bort**: Klicka "🗑️ Ta bort" (10 sek ångrafönster)

## 🛠️ Utveckling

### Skript

```bash
npm run dev              # Lokal server
npm run generate-pages   # Generera berättelsesidor
npm run build           # Bygg för produktion
npm run deploy          # Förbered deployment
```

### Firebase-konfiguration

För egen Firebase-databas:

1. Skapa projekt på [Firebase Console](https://console.firebase.google.com)
2. Aktivera Firestore Database
3. Uppdatera `firebaseConfig` i index.html

### Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /posts/{document} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

## 🔍 SEO

### Meta Tags

- ✅ Titel- och beskrivningstaggar
- ✅ Open Graph för sociala medier
- ✅ Twitter Cards
- ✅ Språk- och geo-targeting (sv-SE)
- ✅ Canonical URLs

### Strukturerad Data

- ✅ **WebSite Schema**: Huvudsida
- ✅ **Article Schema**: Berättelser
- ✅ **BreadcrumbList**: Navigation
- ✅ **ItemList**: Berättelsesamling

### Teknisk SEO

- ✅ Semantisk HTML5
- ✅ Korrekt heading-hierarki
- ✅ Alt-text för bilder
- ✅ Mobile-first design
- ✅ Fast page load

### Target Keywords

- svenska sagor
- barnböcker online
- barnberättelser
- sagor för barn
- svenska barnböcker
- gratis sagor
- godnattsagor

### SEO-checklista

- [x] Comprehensive meta tags
- [x] Open Graph och Twitter Cards
- [x] Schema.org strukturerad data
- [x] Robots.txt och sitemap.xml
- [x] Individuella sidor för varje berättelse
- [x] Breadcrumb-navigation
- [x] Mobile-responsive design
- [x] Semantic HTML
- [x] HTTPS (via Netlify)

### Nästa Steg

- [ ] Submit sitemap till Google Search Console
- [ ] Konfigurera Google Analytics
- [ ] Lägg till Bing Webmaster Tools

## 🔧 Teknisk Stack

### Frontend

- **HTML5**: Semantisk markup
- **CSS3**: Custom properties, flexbox, grid, animations
- **JavaScript ES6+**: Async/await, modules

### Backend & Lagring

- **Firebase Firestore**: Realtidsdatabas
- **LocalStorage**: Utkast och preferenser

### Build & Deploy

- **Node.js**: Build scripts
- **Netlify**: Automatisk deployment med CDN
- **Git**: Versionskontroll

## 📱 Browser-stöd

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Mobile browsers (iOS/Android)

## 🆘 Support

### Vanliga Problem

**Berättelser laddas inte**

- Kontrollera internetanslutning
- Verifiera Firebase-status
- Rensa webbläsarens cache

**Kan inte logga in**

- Kontrollera att Firebase Authentication är konfigurerat korrekt
- Se `docs/SECURITY-TODO.md` för felsökning

**Sidan laddas långsamt**

- Rensa cache
- Kontrollera internetanslutning
- Testa på annat nätverk

### Kontakt

- **E-post**: tomas.roosguerra@gmail.com
- **GitHub**: [TomasRoosGuerra/skogsmulle](https://github.com/TomasRoosGuerra/skogsmulle)

## 📄 Licens

© 2025 Skogsmulle - Alla berättelser skapade med kärlek för barn och föräldrar.

MIT License - se LICENSE fil för detaljer.

---

**🌟 Tack för att du använder Skogsmulle!**

_Skapad med ❤️ för svenska barn och deras familjer_

_Version 2.0.0 | Oktober 2025_
