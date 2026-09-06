# Bokflöde

Bokföring för en liten byrå: underlag → verifikation → avstämning → periodavslut. Dubbel bokföring med BAS-kontoplan, moms 25 % och räkenskapsår 2026.

Stacken är **SQLite**, **Express**, **React** och **Node.js**. Samma byråflöde och regler som tidigare (debet = kredit, underlag före bokföring, avstämning före lås) och samma klient **Havregård Handel AB**.

All data ligger i en lokal fil, `data/bokflode.sqlite`. Ingen databas-server behövs.

## Köra lokalt

Kräver Node.js 22 eller nyare (inbyggd SQLite).

```bash
npm install
cp server/.env.example server/.env
# Redigera server/.env och byt SESSION_SECRET och BOKFLODE_PASSWORD
npm run dev
```

Öppna [http://127.0.0.1:5173](http://127.0.0.1:5173). API:t binder som standard till **127.0.0.1:3001** (inte `0.0.0.0`). Vite proxar `/api` dit.

Logga in med `BOKFLODE_USER` (default `bokflode`) och `BOKFLODE_PASSWORD`. Sessionen lagras i en httpOnly-cookie (`SameSite=Lax`).

Produktion:

```bash
npm run build
npm start
```

Express serverar då det byggda React-gränssnittet från `client/dist`, fortfarande på `HOST` (default `127.0.0.1`).

## Miljövariabler

Kopiera `server/.env.example` till `server/.env`. Committa aldrig `.env`.

| Variabel | Obligatorisk | Default | Beskrivning |
|---|---|---|---|
| `PORT` | nej | `3001` | API-port |
| `HOST` | nej | `127.0.0.1` | Bindningsadress. API:t lyssnar inte på alla gränssnitt om du inte sätter t.ex. `0.0.0.0`. |
| `SQLITE_PATH` | nej | `data/bokflode.sqlite` | Sökväg till databasfilen |
| `SESSION_SECRET` | **ja** | — | Hemlighet för session-cookie, minst 16 tecken |
| `BOKFLODE_USER` | nej | `bokflode` | Inloggningsnamn |
| `BOKFLODE_PASSWORD` | **ja** | — | Inloggningslösenord |
| `FRONTEND_ORIGIN` | nej | — | Extra CORS-origin utöver `http://127.0.0.1:5173` och `http://localhost:5173` |
| `COOKIE_SECURE` | nej | osatt | Sätt `true` bakom HTTPS |

CORS tillåter bara listade origins, med `credentials: true`. JSON-body är begränsad till 1 MB. Inloggning har enkel rate limit.

## Login-flöde

1. Öppna appen. `GET /api/health` är öppen (ingen sökväg till filen läcker).
2. Övriga `/api`-anrop kräver session. Utan cookie svarar de `401`.
3. `POST /api/auth/login` med `{ "username", "password" }` sätter httpOnly-cookie.
4. `GET /api/auth/me` visar om du är inloggad. `POST /api/auth/logout` rensar sessionen.

Frontend skickar `credentials: "include"` på alla anrop och visar inloggning vid 401.

## Belopp: kronor i API, öre i databasen

API:t tar emot och returnerar **kronor** som number med två decimaler. Vid databasgränsen konverteras till/från **heltal öre** (`INTEGER`):

- `voucher_lines.debit` / `credit`
- `documents.amount`
- `reconciliations.book_balance` / `statement_balance`

Jämförelser sker i öre (`toOre`) så att 12.34 aldrig driver till 12.339999.

Ny databas skapas direkt med INTEGER. En äldre fil med REAL-kronor **migreras automatiskt** (× 100) vid uppstart.

Om migreringen skulle misslyckas för den här demo-appen: stoppa servern, radera `data/bokflode.sqlite` samt ev. `-wal`/`-shm`, och starta om. Seed körs då om (Havregård Handel AB).

Gemensamma hjälpare ligger i `shared/money.js` (en sanning för `round2` / `toOre` / `fromOre` / format).

## Verifikationer raderas inte

Det finns ingen hård radering av verifikationer. `DELETE /api/vouchers/:id` är borttaget och svarar `405`. Fel bokförs som **rättelse** (`reverseVoucher`) i en öppen period. Historiken ska finnas kvar.

Periodlås kräver:

- 0 obokade underlag i perioden
- godkänd avstämning för **bank**, **kund**, **leverantör** och **moms**

Årsavslut bokför årets vinst/förlust på konto **2091** (Årets resultat). **2010** är eget kapital.

## Backup

Kopiera filen `data/bokflode.sqlite` (och gärna `data/bokflode.sqlite-wal` om servern kör). Det är hela registret.

## Tester och CI

```bash
npm test
```

Kör servertesterna (`node:test`) med Node 22: balans, periodlås, rättelse, öre-round-trip, kind-whitelist, closePeriod, yearEndClose på 2091, auth 401/200.

GitHub Actions (`.github/workflows/ci.yml`) kör `npm ci`, `npm test` och `npm audit --omit=dev` (audit får inte fälla bygget).

## Byråflöde

1. **Uppdrag** — klient, organisationsnummer, momsperiod
2. **Underlag** — fakturor, kvitton, bank
3. **Bokför** — verifikation med minst två rader, debet = kredit
4. **Avstämning** — bank, reskontra, moms
5. **Avslut** — lås månad när underlag är noll och alla fyra avstämningar stämmer
6. **Kundrapport** — månadssammanställning till klienten

Register: grundbok, huvudbok, saldobalans/balans/resultat/moms, kontoplan.

## Säkerhet

Det här är **demo-auth för lokal byråanvändning**. En användare, lösenord i miljövariabel, session i minnet.

Publik eller exponerad drift kräver mer: hashed lösenord, riktig användarmodell, persistent session store, HTTPS, backup-rutin och åtkomstkontroll per klient. Bokföringsdata är känsliga — exponera inte API:t mot internet med den här inloggningen.
