# wanderer POI fork

Dieses Repository ist ein unabhängiger, experimenteller Fork von
[open-wanderer/wanderer](https://github.com/open-wanderer/wanderer).
Es ist kein offizielles wanderer-Projekt und wird nicht vom Upstream-Team
betrieben. Das Haupt-Repository bleibt die Quelle für das stabile Projekt, die
offizielle Dokumentation, Releases, Docker-Images und Support-Kanäle.

Der Fork untersucht erweiterte POI-Funktionen für wanderer. Ziel ist es,
Points of Interest nicht nur als Karten-Overlay zu nutzen, sondern als eigene
Datenobjekte mit Kategorien, Attributen, Sichtbarkeit und Import-Workflow.

## Status

Dieser Fork ist ein Experiment und kein offizieller wanderer-Release. Teile der
Implementierung und Dokumentation wurden mit Hilfe eines KI-Agenten erstellt und
iterativ überarbeitet. Der Code sollte vor produktiver Nutzung geprüft werden;
Datenbankmigrationen und API-Verträge können sich noch ändern.

## Was dieser Fork ausprobiert

- eigene PocketBase-Collections für POIs, POI-Kategorien und POI-Attribute
- eine POI-Seite mit Karte, Liste, Suche und Kategorie-/Sichtbarkeitsfiltern
- Erstellen, Bearbeiten und Löschen eigener POIs
- öffentliche und private POIs
- konfigurierbare Kategorien mit Icons und Attributdefinitionen
- KML/KMZ-Import für POIs
- POI-Anzeige und Interaktion in Karten- und Routenplanungsansichten
- API-Endpunkte unter `web/src/routes/api/v1/poi*`
- deutsch- und englischsprachige UI-Texte fuer die experimentellen Bereiche

## Beziehung zum Hauptprojekt

wanderer selbst ist eine self-hosted Trail-Datenbank. Tracks können hochgeladen,
erstellt, durchsucht, visualisiert und mit Metadaten organisiert werden. Alle
grundlegenden Funktionen, Setup-Hinweise und Projektentscheidungen stammen aus
dem upstream Projekt:

- Haupt-Repository: [open-wanderer/wanderer](https://github.com/open-wanderer/wanderer)
- Dokumentation: [wanderer.to](https://wanderer.to)
- Lizenz: [AGPLv3](LICENSE)

Issues, Feature-Diskussionen und Support für wanderer gehören grundsätzlich
ins Haupt-Repository. Rückmeldungen zu den experimentellen POI-Erweiterungen
sind im Issue-Tracker dieses Forks besser aufgehoben.

## Lokale Nutzung

Zum Ausprobieren dieses Forks sollte der Code aus diesem Repository gebaut
werden. Die veröffentlichten Docker-Images des Hauptprojekts enthalten die
POI-Erweiterungen dieses Forks nicht automatisch. Die Clone-URL steht auf der
Seite dieses Repositorys im GitHub-Menü **Code**.

Für die Entwicklungsumgebung und den Aufbau der Services gelten weiterhin die
upstream Hinweise zur Installation aus dem Quellcode:
[Local development](https://wanderer.to/develop/local-development).

## Hinweise fuer Mitwirkende

Dieser Fork ist bewusst klein gehalten: Änderungen sollten möglichst klar auf
das POI-Experiment bezogen sein. Wenn eine Änderung nicht POI-spezifisch ist,
sollte sie nach Möglichkeit upstream in
[open-wanderer/wanderer](https://github.com/open-wanderer/wanderer)
diskutiert werden.
