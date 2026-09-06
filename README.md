# Bokflöde

Bokföring för en liten byrå: underlag → verifikation → avstämning → periodavslut. Dubbel bokföring med BAS-kontoplan, moms 25 % och räkenskapsår 2026.

Stacken är **SQLite**, **Express**, **React** och **Node.js**. Samma byråflöde och regler som tidigare (debet = kredit, underlag före bokföring, bankavstämning före lås) och samma klient **Havregård Handel AB**.

All data ligger i en lokal fil, `data/bokflode.sqlite`. Ingen databas-server behövs.

## Köra lokalt

Kräver Node.js 22 eller nyare (inbyggd SQLite).

```bash
npm install
npm run dev
```

Öppna [http://127.0.0.1:5173](http://127.0.0.1:5173). API:t ligger på [http://127.0.0.1:3001](http://127.0.0.1:3001).

Valfri sökväg till databasfilen:

```bash
# server/.env
PORT=3001
SQLITE_PATH=data/bokflode.sqlite
```

Produktion:

```bash
npm run build
npm start
```

Express serverar då det byggda React-gränssnittet från `client/dist`.

## Byråflöde

1. **Uppdrag** — klient, organisationsnummer, momsperiod
2. **Underlag** — fakturor, kvitton, bank
3. **Bokför** — verifikation med minst två rader, debet = kredit
4. **Avstämning** — bank, reskontra, moms
5. **Avslut** — lås månad när underlag är noll och banken stämmer
6. **Kundrapport** — månadssammanställning till klienten

Register: grundbok, huvudbok, saldobalans/balans/resultat/moms, kontoplan.
