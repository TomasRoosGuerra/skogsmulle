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
