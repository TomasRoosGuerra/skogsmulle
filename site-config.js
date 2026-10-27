/**
 * Centraliserad webbplatskonfiguration för Skogsmulle
 * 
 * VIKTIGT: Webbplatsens namn är TILLFÄLLIGT och kommer att ändras.
 * När det slutliga namnet är bestämt, ändra bara SITE_NAME här,
 * så uppdateras det automatiskt överallt på sajten.
 */

const SITE_CONFIG = {
  // Tillfälligt namn - ändra här när det slutliga namnet är bestämt
  SITE_NAME: 'Skogsmulle',
  
  // Övrig konfiguration
  BASE_URL: 'https://skogsmulle.netlify.app',
  TARGET_AGE: '3–12 år',
  DESCRIPTION: 'Magiska svenska barnberättelser',
  AUTHOR: 'Tomas Roos Guerra',
  COPYRIGHT_YEAR: new Date().getFullYear(),

  // Nyhetsbrev (för föräldrar). Lämna tom sträng tills en e-posttjänst är vald och godkänd:
  // formuläret är då synligt men avstängt. Sätt till tjänstens https-adress för formulärinskick
  // (POST med fältet "email"). Tjänsten måste själv skicka bekräftelsemejl (double opt-in).
  // Kom ihåg att lägga tjänstens domän i connect-src i netlify.toml när CSP skärps.
  NEWSLETTER_ENDPOINT: '',

  // Ämnesikoner för kategorifilter och berättelsekort (se assets/images/README.md)
  ICON_DIR: 'assets/images/icons/',
  CATEGORY_ICONS: {
    äventyr: 'ikon-segelbat',
    vänskap: 'ikon-stuga',
    natur: 'ikon-lov',
    magi: 'ikon-manen',
    djur: 'ikon-ekollon',
    lärdom: 'ikon-svamp',
  },

  // Firebase-konfiguration (publik, ingen hemlighet)
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyAl4FKCAqrt_Vkw0jRddSnR1gn4BGby-rA",
    authDomain: "skogsmulle-c601d.firebaseapp.com",
    projectId: "skogsmulle-c601d",
    storageBucket: "skogsmulle-c601d.firebasestorage.app",
    messagingSenderId: "878822846379",
    appId: "1:878822846379:web:b545d30bab52d19a5facee",
    measurementId: "G-SV2RJXDS5S"
  }
};

// Exportera för användning i både Node och webbläsare
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SITE_CONFIG;
}
