# Spil til iPad — plan

Simple, sjove spil til en 7-årig, der kan alfabetet, men ikke læser endnu. Spillene køres som
webapp (PWA) på en iPad 11 (A16): åbnes i Safari → Del → "Føj til hjemmeskærm". Ingen App Store.

Grundprincipper:
- **Ingen tekst i spillene** — kun billeder, ikoner, farver og oplæst dansk tale.
- Læring (bogstavlyde, ord, tal og regning) bygges ind som en del af det sjove, ikke som opgaver.
- Fejl straffes blidt: et sjovt "puf!" og en ny chance med det samme.
- Personlige data (navn, stemmeoptagelser, rekorder) gemmes kun på iPaden, aldrig i repoet —
  repoet er offentligt.

## 🏎️ Racerspillet (først)

- **Kørsel:** bilen set bagfra, pseudo-3D i retro-stil, vej med sving og bakker. Styres ved at
  vippe iPaden; bilen kører selv fremad.
- **Løbet:** 5 computerbiler, 3 omgange, nedtælling 3-2-1-KØR, placering og pokal.
- **Sværhedsgrad 1–5** vælges på menuen (5 er meget svært); computerbilernes fart og hvor meget
  de venter på spilleren afhænger af niveauet.
- **🔥 Turbo med ild og lyn (fra start):** turbo-knap der lader op på 10 sekunder. Ved brug sprøjter
  flammer og lyn ud af udstødningen, kameraet ryster, farten stiger. Senere giver regne-portene
  også turbo.
- **🌋 Lava og ramper:** blinkende pile på vejen viser op til en rampe, bilen flyver over
  lavaen. Misser man rampen: "puf!" og man starter igen lige foran pilene.
- **🕳️ Huller:** bilen falder ned på en underjordisk jordbane; en rampe sender den højt op i
  luften, og den lander på vejen igen. En belønning, ikke en fælde.
- **Læring:**
  - *Turbo-porte:* et regnestykke vises og læses højt (først 🍎🍎🍎 + 🍎🍎, senere "3 + 2"); den
    rigtige port giver turbo. Sværhedsgrad: op til 5 → op til 10 → minus.
  - *Bogstavjagt:* samle bogstaver i rækkefølge, hvert siges med sin lyd, og de bliver til et ord
    med billede (B-I-L → 🚗 "BIL!").

## 🎸 Rytmespillet (bagefter)

- Noder glider ned i 3–4 farvede baner og rammes i takt. Point for præcision og combo.
- Score 0–100 når sangen er slut; rekord gemmes pr. sang og kan udfordres.
- Børnesange uden ophavsret (Mester Jakob, Lille Peter Edderkop, Hjulene på bussen) plus egne
  rock-numre.
- *Bogstav-Rock:* hver node er et bogstav, der siges med sin lyd; til sidst bliver bogstaverne til
  et ord med billede (M-U-S → 🐭).

## Byggeplan

| Fase | Indhold | Status |
|---|---|---|
| 0 | Opsætning af `spil/`, GitHub Pages, PWA og tilt-test på iPaden | ✅ |
| 1 | Racerspillet: kørsel, bane, 3 omgange, computerbiler, placering, pokal og turbo med ild og lyn, sværhedsgrad 1–5 | ✅ |
| 2 | Lava med ramper og genstart, plus huller med underjordisk bane og hop | |
| 3 | Turbo-porte med regning og bogstavjagt | |
| 4 | Rytmespillet: grundspil, 3 sange, score og rekorder | |
| 5 | Bogstav-Rock i rytmespillet | |

Medbestemmelse (bil-designer, egen stemme, bane-editor) er udeladt for nu.

## Teknik

- Vite + TypeScript, tegnet direkte på `<canvas>`; lyd genereres med Web Audio. Ingen tunge
  afhængigheder.
- Hostes på GitHub Pages via `.github/workflows/spil-pages.yml` ved push til `main`:
  https://mdw-sg.github.io/AI-MAGIC/
- Service worker (`public/sw.js`) gør spillet spilbart offline efter første indlæsning.
- Tilt læses fra `devicemotion` som rattets drejning (tyngdekraftens vinkel i skærmplanet i
  forhold til stillingen ved nedtællingen) — kræver https, og iPaden spørger kun om lov ved et
  `click` (ikke `pointerdown`).
- Racerspillet er klassisk pseudo-3D (vejsegmenter med kurve og højde): `src/race/track.ts`
  bygger banen, `render.ts` tegner den, `race.ts` er løbet og HUD, `results.ts` podiet.
  Pokaler gemmes i iPadens `localStorage`.
