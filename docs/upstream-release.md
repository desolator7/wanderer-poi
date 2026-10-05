# Upstream-Version und Fork-Funktionen

Die Anwendung verwendet Upstream **v0.21.0**, Commit `a93566bc`, mit der
Fork-Kennzeichnung **0.21.0 Ver. 161.26.023**. Die Kennzeichnung steht klein
unter `/legal`.

## Kategorien und automatische Berechnungen

Alle Upstream-Kategorien mit ihren Unterkategorien stehen zur Auswahl. Kategorie
und Berechnungsprofil werden getrennt behandelt: Hiking und Walking verwenden
das Fußprofil, Biking das Fahrradprofil. Die Unterkategorien MTB und E-Bike
wählen ihre jeweiligen Fahrradprofile; die Profile können weiter angepasst werden.

Distanz und Höhenmeter werden bei allen Sportarten aus der Geometrie berechnet.
Eine automatische Dauer wird mit dem Fuß- oder Fahrradprofil berechnet.
Bei Running, Skiing, Canoeing, Climbing, Other und eigenen Kategorien bleibt
die Dauer aus dem Import oder der manuellen Eingabe erhalten. Das automatische
Routing ist dort deaktiviert. Eine SAC-Einstufung wird ausschließlich für Hiking
ausgewertet, wenn die Routingdaten eine Einstufung liefern. Sonst bleibt die
Schwierigkeit aus dem Import oder der manuellen Eingabe maßgeblich.

## Persönliche Erledigt-Anzeige

Eine Tour erscheint für einen angemeldeten Benutzer als erledigt, wenn er
einen eigenen Gipfellog für sie besitzt oder seine eigene Tour manuell als
erledigt markiert hat. Die manuelle Markierung einer fremden Tour zählt nicht
als persönliche Begehung. Ohne Anmeldung gibt es keine persönliche Markierung.

`completed` und `completed_at` bleiben die Upstream-Felder der Tour. Die
persönliche Anzeige wird zusätzlich aus dem angemeldeten Benutzer und seinen
Gipfellogs berechnet. Die Statistik zählt eigene Gipfellogs und ergänzt manuell
erledigte Touren nur, wenn es keinen eigenen Gipfellog dafür gibt.

## Plugin-Import

Die Bundles für Komoot, Strava und Hammerhead werden aus `plugins/` gebaut.
Die Datenbank entdeckt sie unter `/data/plugins`; das Verzeichnis wird dauerhaft
aus `data/plugins` eingebunden. Die Einstellungen stehen unter
`/settings/plugins`. Bestehende Komoot-Instanzen behalten ihre Zugangsdaten und
ihre Konfiguration.

Der gemeinsame Import berücksichtigt:

- `config.host.excludedTrailIds`: Quell-IDs, die dieser Plugin-Instanz nicht
  erneut importieren darf. Die Einstellungen erlauben eine ID pro Zeile.
- Duplikate anhand von Benutzer, Anbieter und Quell-ID, sowohl bei Touren als
  auch bei bereits zugeordneten Gipfellogs.
- Gipfellogs einschließlich GPX-Datei, Anbieter und externer Quell-ID für
  abgeschlossene Aktivitäten.
- Eine bereits importierte geplante Tour erhält beim späteren Import ihrer
  Aktivität einen Gipfellog; ihre geplante Geometrie bleibt erhalten.
- Wegpunkte aus der GPX-Geometrie, wenn der Anbieter keine Wegpunkte liefert.
- Vor dem Löschen einer importierten Tour werden ihre Quell-IDs in den
  passenden Plugin-Instanzen ihres Benutzers als Ausschlüsse gespeichert.
  Das gilt auch beim Zuordnen einer Tour zu einem Gipfellog.

Die Zuordnung zu Gipfellogs ist weiterhin im Tourmenü verfügbar. Vorhandene
Gipfellogs werden auf die Zieltour verschoben. Fehlt ein Gipfellog, erzeugt die
Zuordnung einen neuen mit den Tourdaten und der GPX-Datei.

## Laufzeit und Datenbank

Die Datenbank benötigt Go 1.26; die WASM-Bundles benötigen TinyGo 0.41.1.
Die Web-Abhängigkeiten entsprechen dem Upstream-Release. Web und Datenbank
benötigen denselben zufälligen `POCKETBASE_PROXY_SECRET` in der lokalen `.env`.
Die Datei und sämtliche Laufzeitdaten werden nicht versioniert.

Die offiziellen Upstream-Migrationen bleiben unverändert. PocketBase führt
ausstehende Migrationen automatisch beim Start aus. Es gibt für dieses Update
keine zusätzliche Fork-Migration. POIs, Attribute, Gipfellogs, Kategorien und
Authentik-Verknüpfungen liegen weiterhin in der bestehenden Datenbank.

Build, Sicherung und Wiederherstellung sind in
[Containerbetrieb](container-operations.md) beschrieben.
