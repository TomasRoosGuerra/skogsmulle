# Testkonto för automatiska inloggningstester

Sajten har **ingen självregistrering** i UI (bara e-post/lösenords-inloggning).
Ett testkonto måste därför skapas manuellt i Firebase Console av Tomas/Agent Lead.

## 1. Skapa kontot (en gång)

1. Öppna Firebase Console → projektet `skogsmulle-c601d` → Authentication → Users.
2. **Add user** med:
   - E-post: t.ex. `test+skogstrollet@example.com` (eller annan fake-adress utan personuppgifter)
   - Lösenord: generera ett starkt, unikt lösenord (spara bara i secret-store, aldrig i git)
3. Ge kontot **inga** admin-privilegier utöver det som krävs för vanlig författarinloggning på sajten.
4. Kontot ska **inte** innehålla riktiga personuppgifter och **inte** kopplas till betalning.

## 2. Lokalt (utvecklare)

`.env` och `.env.local` är redan i `.gitignore`.

```bash
cp .env.example .env.local
# fyll i:
# SKOGSTROLLET_TEST_EMAIL=...
# SKOGSTROLLET_TEST_PASSWORD=...
```

Kör stub-tester (default, inga secrets):

```bash
BASE_URL=http://localhost:5077/ node tests/e2e-auth.js
```

Kör riktig Auth mot live eller lokal server (kräver env):

```bash
set -a && source .env.local && set +a
BASE_URL=https://skogsmulle.netlify.app/ node tests/e2e-auth-live.js
# eller mot lokal serve:
BASE_URL=http://localhost:5077/ node tests/e2e-auth-live.js
```

Utan env-variabler avslutar `e2e-auth-live.js` med exit 0 och skriver `SKIP` (så CI utan secrets inte fallerar).

## 3. GitHub Actions secrets

Repository → Settings → Secrets and variables → Actions:

| Secret | Värde |
|--------|--------|
| `SKOGSTROLLET_TEST_EMAIL` | testkontots e-post |
| `SKOGSTROLLET_TEST_PASSWORD` | testkontots lösenord |

I workflow (exempel):

```yaml
- name: Auth live (valfritt)
  if: ${{ secrets.SKOGSTROLLET_TEST_EMAIL != '' }}
  env:
    SKOGSTROLLET_TEST_EMAIL: ${{ secrets.SKOGSTROLLET_TEST_EMAIL }}
    SKOGSTROLLET_TEST_PASSWORD: ${{ secrets.SKOGSTROLLET_TEST_PASSWORD }}
    BASE_URL: https://skogsmulle.netlify.app/
  run: node tests/e2e-auth-live.js
```

Stub-sviten `tests/e2e-auth.js` ska alltid köras i CI **utan** secrets.

## 4. Vad som inte får göras

- Inga lösenord eller service accounts i repot
- Ingen ändring av Firebase Auth-regler, Firestore-regler eller konsol via agenten
- Inga skrivningar till produktionsberättelser i live-testet (skrivningar avbryts via Playwright-route)
