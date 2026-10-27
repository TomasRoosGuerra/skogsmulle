# Säkerhetskonfiguration för Firebase

> **STATUS (27 oktober 2026):** Steg 1-3 och 6 är genomförda av ägaren. Firestore-regler nedan är uppdaterade till e-postbaserad autentisering.

## Bakgrund

Den tidigare "inloggningen" var bara ett textfält som jämförde e-postadresser som stod i klartext i HTML:en. Det finns inget verkligt skydd utan dessa steg.

## ✅ Genomförda steg (27 oktober 2026)

### ✅ 1. Aktivera Firebase Authentication
**STATUS:** Klart av ägaren 27 okt 2026.

Firebase Authentication (E-post/lösenord) är aktiverat i projektet `skogsmulle-c601d`.

### ✅ 2. Skapa användarkonto
**STATUS:** Klart av ägaren 27 okt 2026.

Användarkonto skapat för `tomas.roosguerra@gmail.com` med säkert lösenord.

### ✅ 3. Stäng av öppen registrering
**STATUS:** Klart av ägaren 27 okt 2026.

"Enable create (sign-up)" är avmarkerad i Authentication → Settings → User actions. Endast befintliga användare kan logga in.

### ✅ 6. Authorized domains
**STATUS:** Klart av ägaren 27 okt 2026.

Authorized domains kontrollerade i Authentication → Settings. `skogsmulle.netlify.app` och `localhost` finns med.

---

## ⚠️ Återstående obligatoriska steg

### 4. Konfigurera Firestore-säkerhetsregler

**STATUS:** MÅSTE GÖRAS MANUELLT I FIREBASE-KONSOLEN

1. Gå till **Firestore Database → Rules**
2. Ersätt allt innehåll med reglerna nedan
3. Klicka på **Publish**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // E-postbaserad ägarkontroll (sign-up är avstängt, endast en användare finns)
    function isOwner() {
      return request.auth != null
          && request.auth.token.email == "tomas.roosguerra@gmail.com";
    }

    function validPost(d) {
      return d.title is string && d.title.size() > 0 && d.title.size() <= 200
          && d.content is string && d.content.size() > 0 && d.content.size() <= 200000;
    }

    // Berättelser: alla får läsa, bara ägaren får skriva.
    match /posts/{postId} {
      allow read: if true;
      allow create: if isOwner() && validPost(request.resource.data);
      allow update: if isOwner() && validPost(request.resource.data);
      allow delete: if isOwner();
    }

    // Allt annat är stängt.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**Testa reglerna:**
- Använd "Rules playground" i Firebase-konsolen
- Testa att en utloggad användare kan läsa `posts/test` men inte skriva
- Testa att autentiserad användare med rätt e-post kan skriva

---

### 5. Storage-säkerhetsregler (valfritt – Storage inte aktiverat)

**STATUS:** Storage är INTE aktiverat och behövs inte för närvarande.

Firebase Storage kräver en betald plan (Blaze) och används inte av sajten. Om du aktiverar Storage i framtiden, använd dessa regler:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null
                   && request.auth.token.email == "tomas.roosguerra@gmail.com"
                   && request.resource.size < 10 * 1024 * 1024;
    }
  }
}
```

**OBS:** Hoppa över detta steg tills Storage behövs.

---

### 7. (Valfritt men rekommenderat) Aktivera App Check

App Check skyddar mot missbruk och skräppost genom att verifiera att anrop kommer från din legitima app.

**STATUS:** Inte genomfört än (valfritt).

1. Gå till **Build → App Check**
2. Klicka på **Register app** och välj **Web**
3. Välj **reCAPTCHA v3** som provider
4. Följ instruktionerna för att skapa en site key hos Google reCAPTCHA
5. Starta i läge **"Unenforced"** (monitoring)
6. Efter några dagar, kontrollera måtten i App Check
7. Om allt ser bra ut, ändra till **"Enforce"** för Firestore

**OBS:** App Check kräver ytterligare ändringar i klientkoden. Hoppa över detta steg tills vidare – de grundläggande reglerna ovan är det viktigaste skyddet.

---

## Testa att det fungerar

1. Öppna sajten i en inkognitoflik
2. Försök logga in med fel e-post eller lösenord → ska visa tydligt felmeddelande
3. Logga in med `tomas.roosguerra@gmail.com` och korrekt lösenord → ska fungera
4. Kontrollera att redigeringsverktygen dyker upp
5. Testa att skapa en berättelse
6. Logga ut och kontrollera att redigeringsverktygen försvinner

## Säkerhetsnoteringar

- **Firebase-konfigurationen** (apiKey m.m.) som står i koden är **avsedd att vara publik** och är inte en hemlighet. Skyddet ligger i Authentication och säkerhetsreglerna.
- **Använd alltid en lösenordshanterare** för ditt Firebase-lösenord.
- **E-postadressen** `tomas.roosguerra@gmail.com` används både för inloggning och i Firestore-reglerna.

## Kontakt vid problem

Om något inte fungerar, kontrollera:
- Att e-postadressen i Firestore-reglerna är korrekt (`tomas.roosguerra@gmail.com`)
- Att Firestore-reglerna publicerats utan syntaxfel
- Att Authentication är aktiverad och "Enable create" är avmarkerad
- Webbläsarkonsolen för felmeddelanden (F12 → Console)

För Firebase-support: <https://firebase.google.com/support>
