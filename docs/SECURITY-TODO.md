# Säkerhetskonfiguration för Firebase (MÅSTE GÖRAS AV ÄGAREN)

> **VIKTIGT:** Dessa steg måste göras manuellt i Firebase-konsolen. Koden har förberetts, men Firebase-reglerna och Authentication kan inte konfigureras automatiskt från denna repository.

## Bakgrund

Den tidigare "inloggningen" var bara ett textfält som jämförde e-postadresser som stod i klartext i HTML:en. Det finns inget verkligt skydd utan dessa steg.

## Obligatoriska steg i Firebase-konsolen

Öppna <https://console.firebase.google.com> och välj projektet `skogsmulle-c601d`.

### 1. Aktivera Firebase Authentication

1. Gå till **Build → Authentication**
2. Klicka på **Get started**
3. Under **Sign-in method**, aktivera **E-post/lösenord** (inte "e-postlänk")
4. Spara

### 2. Skapa ditt användarkonto

1. Gå till **Authentication → Users**
2. Klicka på **Add user**
3. Ange din e-postadress: `tomas.roosguerra@gmail.com` (eller den du vill använda)
4. Skapa ett **starkt, unikt lösenord** (använd en lösenordshanterare)
5. När användaren skapats, **kopiera User UID** (en sträng som börjar med flera bokstäver/siffror)
6. Spara UID:et säkert – du behöver det i nästa steg

### 3. Stäng av öppen registrering

1. Gå till **Authentication → Settings → User actions**
2. **Avmarkera** "Enable create (sign-up)"
3. Detta hindrar andra från att skapa nya konton

### 4. Konfigurera Firestore-säkerhetsregler

1. Gå till **Firestore Database → Rules**
2. Ersätt allt innehåll med reglerna nedan (byt ut `REPLACE_WITH_OWNER_UID` mot din User UID från steg 2)
3. Klicka på **Publish**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isOwner() {
      return request.auth != null
          && request.auth.uid == "REPLACE_WITH_OWNER_UID";
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

### 5. Konfigurera Storage-säkerhetsregler

Sajten använder inte Storage för närvarande, men bucketen finns i konfigurationen.

1. Gå till **Storage**
2. Om du inte har aktiverat Storage än, klicka **Get started**
3. Gå till **Rules**
4. Ersätt innehållet med reglerna nedan (byt ut `REPLACE_WITH_OWNER_UID`)
5. Klicka på **Publish**

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null
                   && request.auth.uid == "REPLACE_WITH_OWNER_UID"
                   && request.resource.size < 10 * 1024 * 1024;
    }
  }
}
```

### 6. Kontrollera Authorized domains

1. Gå till **Authentication → Settings → Authorized domains**
2. Kontrollera att följande domäner finns med:
   - `skogsmulle.netlify.app`
   - `localhost` (för lokal testning)
3. När du byter till det slutliga domännamnet, lägg till den nya domänen här

### 7. (Valfritt men rekommenderat) Aktivera App Check

App Check skyddar mot missbruk och skräppost genom att verifiera att anrop kommer från din legitima app.

1. Gå till **Build → App Check**
2. Klicka på **Register app** och välj **Web**
3. Välj **reCAPTCHA v3** som provider
4. Följ instruktionerna för att skapa en site key hos Google reCAPTCHA
5. Starta i läge **"Unenforced"** (monitoring)
6. Efter några dagar, kontrollera måtten i App Check
7. Om allt ser bra ut, ändra till **"Enforce"** för Firestore

**OBS:** App Check kräver ändringar i klientkoden som inte är inkluderade i denna version. Hoppa över detta steg tills vidare om du vill – de grundläggande reglerna ovan är det viktigaste skyddet.

## Aktivera Authentication i koden

När du har genomfört stegen ovan måste du aktivera den nya inloggningen:

1. Öppna `index.html`
2. Hitta konstanten `FIREBASE_AUTH_ENABLED` längst upp i scriptet (ca rad 10 i `<script>`-blocket)
3. Ändra från `false` till `true`
4. Committa och pusha ändringen
5. Den gamla textfält-inloggningen kommer då att ersättas med riktig Firebase Authentication

## Efter att du har gjort detta

- Den gamla "inloggningen" (textfält med e-postadress i localStorage) fungerar inte längre
- Du loggar in med e-post och lösenord via Firebase Authentication
- Endast du (med det User UID du angav) kan skapa, ändra eller radera berättelser
- Alla kan fortfarande läsa berättelser (vilket är meningen)

## Säkerhetsnoteringar

- **Firebase-konfigurationen** (apiKey m.m.) som står i koden är **avsedd att vara publik** och är inte en hemlighet. Skyddet ligger i Authentication och säkerhetsreglerna.
- **De gamla e-postadresserna** som stod öppet i koden (`tomas.roosguerra@gmail.com`, `tomasroosguerra@gmail.com`) har varit publika. De är inga lösenord, men överväg att rotera dem om du får spam.
- **User UID** ska inte delas publikt, även om det inte är ett lösenord.
- **Använd alltid en lösenordshanterare** för ditt Firebase-lösenord.

## Testa att det fungerar

1. Öppna sajten i en inkognitoflik
2. Försök logga in med fel e-post → ska misslyckas
3. Logga in med din e-post och lösenord → ska fungera
4. Kontrollera att redigeringsverktygen dyker upp
5. Testa att skapa en berättelse
6. Logga ut och kontrollera att redigeringsverktygen försvinner

## Kontakt vid problem

Om något inte fungerar, kontrollera:
- Att User UID är korrekt kopierad (inga mellanslag)
- Att Firestore-reglerna publicerats utan syntaxfel
- Att Authentication är aktiverad och "Enable create" är avmarkerad
- Webbläsarkonsolen för felmeddelanden (F12 → Console)

För Firebase-support: <https://firebase.google.com/support>
