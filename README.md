# Sommerdetektive – Verlosung

Kleines, eigenständiges Werkzeug für die **live Ziehung** des Sommerdetektive-Gewinnspiels
(siehe `../sommerdetektive/frontend/src/pages/gewinnspiel-page.tsx`). Übernimmt bewusst nur
das Aussehen ("Detektiv-Akten"-Look aus `sommerdetektive/frontend/src/app.css`), keinen Code
und keine Abhängigkeit von dort – reines statisches HTML/CSS/JS, kein Build, keine npm-Pakete.

## Benutzung

`index.html` einfach im Browser öffnen (lokal per Doppelklick, oder irgendwo statisch
gehostet – funktioniert auch offline, keine externen Ressourcen).

1. **Gewinnpakete:** sind als feste Liste in `app.js` (`DEFAULT_PRIZES_TEXT`) hinterlegt und
   beim ersten Aufruf schon vorbelegt/geladen (siehe „Aktuelle Gewinnliste“ unten). Bei Bedarf
   im Textfeld editieren und „Gewinne laden“ klicken – je Zeile ein Gewinnpaket, am
   Zeilenende die Anzahl (Copy &amp; Paste aus zwei Excel-Spalten „Gewinnpaket“ und „Anzahl“,
   z. B. `Gutschein Eisdiele␉5`). Auch ganz ohne Gewinnpakete zieht das Tool einfach ohne
   Zuordnung.
2. **Lostopf befüllen:** Losnamen aus der Excel-Liste per Copy &amp; Paste einfügen –
   ein Name pro Zeile (bei mehrspaltigem Paste zählt nur die erste Spalte). Empfohlen:
   Spalte „Detektivname“, da laut Gewinnspielregeln der Detektivname der Losname bei der
   Ziehung ist, nie die Mailadresse.
3. **Ziehen:** Sind Gewinnpakete geladen, wählt ein Dropdown über dem Ziehen-Button, für
   welches Paket als Nächstes gezogen wird – vorbelegt ist immer das erste noch offene Paket
   in Listenreihenfolge, lässt sich aber jederzeit manuell auf ein anderes Paket umstellen
   (bleibt dann so lange ausgewählt, bis dieses Paket komplett vergeben ist; die Anzahl
   offener Plätze steht direkt in der Dropdown-Option, z.B. „Playmobil Anhänger (noch 5 von
   5)“). Ein Klick auf „🎲 Ziehen“ zieht dann **immer das ganze gewählte Paket auf einmal** –
   bei 1 offenem Platz eine Person, bei 5 alle 5 nacheinander (kurze Shuffle-Animation pro
   Person, kein Einzel-Popup dazwischen), und zeigt am Ende alle gezogenen Gewinner:innen
   zusammen in einem Popup mit Konfetti, das erst mit „Weiter →“ weggeht. Sind alle Pakete
   vollständig vergeben, sperrt sich der Button, auch wenn noch Namen im Lostopf sind. Über
   dem Draw-Bereich zeigt „🏆 X von Y Gewinnen insgesamt vergeben“ den Gesamtfortschritt.
   Jede Person gewinnt maximal einmal – fest verdrahtet direkt vor jeder Ziehung, nicht nur
   durch die Reihenfolge der Bedienung.
4. **Rückgängig:** „↩️ Rückgängig: [Name]“ unter dem Ziehen-Button macht die allerletzte
   einzelne Ziehung wieder rückgängig (Person zurück in den Lostopf, Protokoll-Eintrag weg,
   Paket-Zähler sinkt automatisch mit) – Sicherheitsnetz für Fehlklicks, z.B. falsches Paket
   im Dropdown gewählt. Während eine Ziehung läuft, ist der Button ausgeblendet.
5. **Präsentationsmodus:** „🖥️ Bühne“ oben rechts blendet Gewinnpakete-/Lostopf-Eingabe und
   das Protokoll aus, vergrößert Bühne, Buttons und Popup – gedacht für einen Beamer/Screen
   vorm Publikum, während die Verwaltung (Listen einfügen, Protokoll einsehen) auf dem
   eigenen Gerät bleibt. „📋 Verwaltung“ schaltet zurück.
6. **Jede Ziehung ist endgültig.** Es gibt keine Ersatzziehung, auch wenn sich eine gezogene
   Person beim Aufruf nicht meldet – laut Teilnahmebedingungen hat sie danach noch 4 Wochen
   Zeit, den Gewinn im Hotel Knorz abzuholen. Der Button „📌 als offen markieren“ neben jedem
   Eintrag ist deshalb eine reine Notiz für dich („hier später nachfragen“, z.B. weil die
   Person beim Aufruf nicht da war), keine Aktion – er ändert nichts daran, wer gewonnen hat,
   und lässt sich jederzeit wieder auf „✅ erledigt“ zurückstellen.
7. **Protokoll:** „📦 Nach Gewinn gruppieren“ schaltet die Liste zwischen chronologisch
   (Ziehungsreihenfolge) und nach Gewinnpaket gruppiert um; die Ziehungsnummer bleibt in
   beiden Ansichten die tatsächliche Ziehungsreihenfolge. „📄 Ergebnis kopieren“ kopiert das
   Protokoll (inkl. Gewinnpaket und Offen-Markierung) in der gerade aktiven Ansicht als
   Klartext in die Zwischenablage, z.B. zur Dokumentation nach der Veranstaltung.
8. **Zurücksetzen:** Löscht Lostopf und Protokoll, setzt die Gewinnpakete auf die feste
   Liste aus `app.js` zurück (siehe unten).

## Aktuelle Gewinnliste

11 Gewinnpakete, 36 Gewinne insgesamt (Stand: siehe `DEFAULT_PRIZES_TEXT` in `app.js`,
dort auch die verbindliche Quelle – diese Tabelle nur zur Übersicht):

| Gewinnpaket | Anzahl |
|---|---|
| Playmobil FunPark – 2 Tageseintritte + Anhänger | 5 |
| Alte Veste 10 € | 2 |
| Eisboutique + Playmobil Anhänger | 5 |
| Nazar | 2 |
| Mosena – 2 Kugeln Eis + Playmobil Anhänger | 5 |
| Playmobil Anhänger | 5 |
| Geschenktasche Stadtwerke | 5 |
| Orfeas 25 € | 1 |
| Bräuschank 20 € | 1 |
| Bücherstube – Set | 1 |
| Sparkasse-Set | 4 |
| **Summe** | **36** |

Ändert sich die Gewinnliste, `DEFAULT_PRIZES_TEXT` in `app.js` anpassen (und diese Tabelle
zur Dokumentation mit aktualisieren).

## Daten

Alles bleibt ausschließlich im Browser-Tab und in `localStorage` dieses Geräts (nur damit ein
versehentliches Neuladen während der Ziehung nichts zerstört) – kein Server, kein Upload,
keine Analytics, keine externen Schriften/CDNs. Die eingefügte Namensliste wird nirgends
committet; sie existiert nur zur Laufzeit im Browser der Person, die die Ziehung durchführt.
