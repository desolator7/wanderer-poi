# PWA-Livemodus

## Startverhalten

Die installierte PWA verwendet `/pwa-start.html` als festen Einstieg. Diese
Datei gehört zu den statischen Ressourcen und wird bei der Installation des
Service Workers in den Versions-Cache übernommen. Dadurch kann der
Start-Router geladen werden, bevor eine SvelteKit-Seite oder eine API-Antwort
benötigt wird.

Der Start-Router liest den lokalen Livemodus-Snapshot:

- Ist ein gültiger Snapshot vorhanden, öffnet er `/live`.
- Ist kein Snapshot vorhanden und das Gerät online, öffnet er `/`.
- Ist kein Snapshot vorhanden und das Gerät offline, bleibt er auf einer
  lokalen Hinweisseite.

Der Manifest-Eintrag `id` bleibt `/`. Damit besitzt die PWA unabhängig vom
technischen Startpfad eine stabile Anwendungskennung.

## Lokaler Routen-Snapshot

Beim Starten des Livemodus speichert der Routen-Editor einen versionierten
Snapshot unter dem Schlüssel `wanderer-pwa-live-route` in `localStorage`. Der
Snapshot enthält:

- die Routen-ID,
- den Rücksprungpfad zum Routen-Editor,
- die gewählte Live-Zoomstufe,
- den Routennamen,
- die vollständigen GPX-Daten.

Der Editor speichert die Route zuerst regulär auf dem Server. Erst nach einem
erfolgreichen Speichervorgang erzeugt er den lokalen Snapshot und öffnet
`/live`. Kann der Browser den Snapshot wegen seiner lokalen Speichergrenze
nicht schreiben, bleibt der Editor geöffnet und zeigt einen Fehler.

## Offline-Shell

Der Service Worker behandelt `/live` als eigenen Cache-Eintrag. Er versucht,
die Shell bei seiner Installation zu laden. Beim Starten des Livemodus wird die
Shell erneut angefordert, damit sie vor einem späteren Offline-Start verfügbar
ist. Statische JavaScript-, CSS-, Schrift- und Symbolressourcen liegen im
gleichen versionsgebundenen Cache.

Die Live-Seite lädt ihre Routengeometrie nicht über die Trail-API. Sie baut das
Trail-Modell aus dem lokalen GPX-Snapshot auf und startet die
MapLibre-Geolokalisierung mit hoher Genauigkeit.

Beim clientseitigen Wechsel aus dem Routen-Editor stabilisiert die Live-Seite
den iOS-Standalone-Viewport nach dem ersten Rendern. MapLibre erhält außerdem
bei verzögerten `resize`-, `visualViewport`- und Orientierungsänderungen ein
erneutes `resize()`, damit die Kartenfläche im Portrait- und Querformat den
gesamten verfügbaren Bildschirm ausfüllt.

## Kartenverhalten

Bei einem Online-Start verwendet der Livemodus die reguläre ausgewählte
Basiskarte. Bei einem Offline-Kaltstart wird eine lokale MapLibre-Grundfläche
ohne externe Quellen verwendet. Darauf bleiben folgende Elemente sichtbar:

- die gespeicherte Route,
- Start- und Zielmarkierung,
- die aktuelle Geräteposition,
- die drei lokalen Zoomstufen,
- Name, Offline-Status und Schaltfläche zum Beenden.

Im lokalen Kartenmodus werden keine Basiskarten-, Overlay-, Terrain-,
Overpass- oder Glyph-Anfragen gestartet. Eine vollständige kartografische
Offline-Karte erfordert einen getrennten, mengenbegrenzten Karten-Cache oder
ein Offline-Kartenpaket. Kartenkacheln werden nicht in `localStorage`
gespeichert.

## Position und Berechtigungen

Die aktuelle Position stammt aus der Geolocation-API des Geräts und nicht aus
dem lokalen Snapshot. GPS kann ohne Internet funktionieren. Verfügbarkeit und
Genauigkeit hängen vom Gerät, den Betriebssystemeinstellungen, der erteilten
Standortberechtigung und dem aktuellen Empfang ab.

Die Anwendung speichert keine Positionshistorie. Sie verwendet nur die
laufenden Positionsereignisse von MapLibre, um die Markierung und den
Kartenausschnitt nachzuführen.

## Beenden

Beim Beenden entfernt die Anwendung den lokalen Snapshot. Ist das Gerät online,
öffnet sie anschließend den gespeicherten Routen-Editor. Ist das Gerät offline,
kehrt sie zum lokalen Start-Router zurück und zeigt dort den Hinweis, dass keine
Offline-Route aktiv ist.

## Prüfung nach einer Aktualisierung

Änderungen am Web-App-Manifest werden auf iOS nicht immer durch ein normales
Neuladen übernommen. Für eine zuverlässige Prüfung ist die PWA vom Home Screen
zu entfernen und neu zu installieren.

Folgende Zustände müssen geprüft werden:

- Online-Start ohne aktiven Livemodus,
- Online-Start mit aktivem Livemodus,
- Offline-Kaltstart mit aktivem Livemodus,
- Offline-Kaltstart ohne aktiven Livemodus,
- Standortberechtigung erteilt, abgelehnt und noch nicht entschieden,
- Beenden des Livemodus online und offline,
- Nah-, Mittel- und Weit-Zoom,
- Hoch- und Querformat auf der installierten iOS-PWA.
