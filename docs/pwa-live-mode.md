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
- das Offlinekartenprofil und den SHA-256-Fingerabdruck der Route,
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

Der Livemodus bietet vier Auswahlmöglichkeiten. „Nah“ verwendet Zoom 17,
„Mittel“ Zoom 15 und „Weit“ Zoom 14. Diese drei Modi zeigen die regulär
konfigurierte Onlinekarte. „Weit (Offline)“ verwendet ebenfalls Zoom 14,
schaltet aber als einziger Modus auf den gecachten OpenTopoMap-Rasterstil um.
Ein Wechsel zwischen Online- und Offlinestil baut die Kartenansicht neu auf,
damit keine Quellen oder Layer des vorherigen Stils erhalten bleiben.

Der Offlinestil fordert nur die Zoomstufen 12 bis 15 an; beim stärkeren
Hineinzoomen vergrößert MapLibre die vorhandene Zoomstufe 15. Der Tile-Download
läuft unabhängig von der aktuell gewählten Kartenansicht im Hintergrund, damit
„Weit (Offline)“ nach Abschluss direkt verfügbar ist.

Kann ein Tile nicht aus dem Cache geladen werden, bleibt an dieser Stelle die
lokale MapLibre-Grundfläche sichtbar. Darauf bleiben weiterhin folgende
Elemente verfügbar:

- die gespeicherte Route,
- Start- und Zielmarkierung,
- die aktuelle Geräteposition,
- die vier lokalen Zoom- und Kartenmodi,
- Name, Offline-Status und Schaltfläche zum Beenden.

Andere Basiskarten, Overlays, Terrain, Overpass und externe Glyphen sind nur im
Modus „Weit (Offline)“ deaktiviert. Die drei Online-Modi verwenden die
regulären Kartenfunktionen. Neue Kartenbereiche benötigen eine
Netzwerkverbindung; bereits betrachtete Bereiche können aus dem flüchtigen
Runtime-Cache kommen.

## Flüchtiger Runtime-Cache

In den Modi „Nah“, „Mittel“ und „Weit“ markiert die Live-Seite ausschließlich
die von MapLibre angeforderten Kartenressourcen. Dazu gehören Style-Dateien,
Raster- und Vector-Tiles, Glyphen, Sprites, Terrain und kachelbasierte
Overlays. Normale Anwendungs- und Overpass-API-Anfragen werden nicht erfasst.
Der Service Worker entfernt die interne Markierung vor der Anfrage; sie wird
nicht an den Kartenanbieter übertragen.

Der Cache speichert nur Ressourcen, die bei der sichtbaren Kartennutzung
tatsächlich angefordert wurden. Er lädt keine weiteren Gebiete, Routenkorridore
oder Zoomstufen vor. Eingebaute und benutzerdefinierte Kartenquellen werden
automatisch gleich behandelt. Ein Instanzbetreiber muss deshalb selbst prüfen,
ob die Nutzungsbedingungen seiner konfigurierten Quellen dieses lokale
Zwischenspeichern erlauben.

Antworten mit `no-store` werden nicht gespeichert. `Cache-Control`, `Expires`,
`no-cache` und `must-revalidate` bleiben maßgeblich. Fehlt eine auswertbare
Laufzeit oder kann der Browser die Header einer opaque Antwort nicht lesen,
gilt ein Fallback von sieben Tagen. Abgelaufene Ressourcen werden offline
nicht ausgeliefert.

Der Runtime-Cache ist auf höchstens 100 MB begrenzt und hält mindestens 10 MB
Browserreserve frei, sofern die Storage-Estimate-API verfügbar ist. Zuerst
werden abgelaufene, danach die am längsten nicht verwendeten Ressourcen
entfernt. Der Cache besitzt bewusst keine Bereitschaftsanzeige, weil sein
Inhalt opportunistisch und niemals als vollständig anzusehen ist. Die
Cachezustandsanzeige unter „Weit (Offline)“ gehört ausschließlich zum
vorbereiteten Routencache. Beide Caches liegen getrennt im Cache Storage und
werden durch „PWA-Cache leeren“ gemeinsam entfernt.

## Begrenzter Tile-Cache

Nach dem Öffnen von `/live` berechnet die PWA aus den GPX-Segmenten einen
500-Meter-Korridor. Der Download beginnt im Hintergrund, während Route,
GPS-Verfolgung und Bedienelemente bereits benutzbar sind. Die vollständige
Route wird zuerst in Zoom 12 und anschließend in den Zoomstufen 13, 14 und 15
aufgenommen. Passt eine weitere vollständige Stufe nicht in das Tile-Limit,
wird diese Stufe ausgelassen und kein einseitiger Routenabschnitt bevorzugt.

Für das Profil gelten folgende Grenzen:

- maximal 1.200 Tiles,
- maximal 60 MB tatsächliche Antwortdaten,
- höchstens zwei parallele Downloadanfragen,
- 10 MB Speicherreserve für die übrigen Anwendungsdaten.

Die PWA versucht vor dem Download, persistenten Browser-Speicher zu erhalten.
Bei Speichermangel, Netzverlust oder einer Providerbegrenzung bleibt der
vorhandene Teilcache nutzbar. Der Status im Livemodus zeigt Fortschritt und
Fehler an und bietet „Download abbrechen“ oder „Erneut versuchen“ an. Eine
Icon-Zeile unter „Weit (Offline)“ zeigt parallel den Cachezustand: blauer
Spinner, grünes Häkchen, gelbes Warnsymbol oder rotes Fehlersymbol. Nach dem
erfolgreichen Abschluss verschwindet die ausführliche Statusleiste. Ein
abgebrochener oder unterbrochener Download wird bei einem späteren Online-Start
anhand des Cachemanifests fortgesetzt.

Es wird nur der Cache der aktiven Route verwaltet. Eine unveränderte Route
verwendet ihren Cache erneut; eine andere oder geänderte Route ersetzt ihn.
Beim Beenden des Livemodus bleibt der aktuelle Cache für einen späteren Start
derselben Route erhalten.

Die Rasterbilder und das Cachemanifest liegen im Cache Storage. `localStorage`
enthält weiterhin nur den kleinen Routensnapshot und ist für Binärdaten nicht
geeignet. Wird die PWA durch das Betriebssystem beendet oder suspendiert, ist
kein weiterer Hintergrunddownload garantiert. Beim nächsten Start wird der
gespeicherte Stand abgeglichen.

OpenTopoMap erlaubt die Nutzung in Anwendungen mit sichtbarer Attribution,
weist aber darauf hin, den öffentlichen Server nicht durch Massendownloads zu
belasten. Das kleine Profil und die Downloadgrenzen dienen dieser Vorgabe.
Maßgeblich bleiben die
[Nutzungshinweise von OpenTopoMap](https://services.opentopomap.org/about).

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
- Nah-, Mittel-, Weit- und Weit-(Offline)-Modus,
- Wechsel zwischen regulärer Onlinekarte und gecachter OpenTopoMap,
- Wiederverwendung betrachteter Onlinekarten bei unterbrochener Verbindung,
- Ablauf und LRU-Bereinigung des flüchtigen Runtime-Caches,
- vollständiger, abgebrochener und fortgesetzter Tile-Download,
- Speichermangel, Netzverlust und Providerbegrenzung,
- Hoch- und Querformat auf der installierten iOS-PWA.
