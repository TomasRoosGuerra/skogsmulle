// Laddar Firebase på begäran i stället för som blockerande modul i <head>.
// Samma SDK-version och samma konfiguration (SITE_CONFIG.FIREBASE_CONFIG) som tidigare.
(function () {
  var V = "https://www.gstatic.com/firebasejs/12.3.0/";
  var core = null, auth = null;
  window.loadFirebaseCore = function () {
    if (!core) {
      core = Promise.all([import(V + "firebase-app.js"), import(V + "firebase-firestore.js")]).then(function (m) {
        var a = m[0], f = m[1];
        var app = a.initializeApp(SITE_CONFIG.FIREBASE_CONFIG);
        Object.assign(window, {
          firebaseApp: app,
          firebaseDb: f.getFirestore(app),
          firebaseCollection: f.collection,
          firebaseAddDoc: f.addDoc,
          firebaseGetDocs: f.getDocs,
          firebaseDoc: f.doc,
          firebaseUpdateDoc: f.updateDoc,
          firebaseDeleteDoc: f.deleteDoc,
          firebaseOnSnapshot: f.onSnapshot,
          firebaseOrderBy: f.orderBy,
          firebaseQuery: f.query,
          firebaseServerTimestamp: f.serverTimestamp
        });
      });
      core.catch(function () { core = null; });
    }
    return core;
  };
  window.loadFirebaseAuth = function () {
    if (!auth) {
      auth = window.loadFirebaseCore().then(function () { return import(V + "firebase-auth.js"); }).then(function (m) {
        Object.assign(window, {
          firebaseAuth: m.getAuth(window.firebaseApp),
          firebaseSignInWithEmailAndPassword: m.signInWithEmailAndPassword,
          firebaseSignOut: m.signOut,
          firebaseOnAuthStateChanged: m.onAuthStateChanged
        });
      });
      auth.catch(function () { auth = null; });
    }
    return auth;
  };
})();
