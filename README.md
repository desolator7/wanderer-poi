# wanderer POI fork

Dieses Repository ist ein experimenteller Fork von
[open-wanderer/wanderer](https://github.com/open-wanderer/wanderer).
Das Haupt-Repository bleibt die Quelle fuer das stabile Projekt, die offizielle
Dokumentation, Releases, Docker-Images und Support-Kanaele.

Der Fork untersucht eine erweiterte POI-Funktion fuer wanderer. Ziel ist es,
Points of Interest nicht nur als Karten-Overlay zu nutzen, sondern als eigene
Datenobjekte mit Kategorien, Attributen, Sichtbarkeit und Import-Workflow.

## Status

Dieser Fork ist ein Experiment und kein offizieller wanderer-Release. Teile der
Implementierung und Dokumentation wurden mit Hilfe eines KI-Agenten erstellt und
iterativ ueberarbeitet. Der Code sollte vor produktiver Nutzung geprueft werden;
Datenbankmigrationen und API-Vertraege koennen sich noch aendern.

## Was dieser Fork ausprobiert

- eigene PocketBase-Collections fuer POIs, POI-Kategorien und POI-Attribute
- eine POI-Seite mit Karte, Liste, Suche und Kategorie-/Sichtbarkeitsfiltern
- Erstellen, Bearbeiten und Loeschen eigener POIs
- oeffentliche und private POIs
- konfigurierbare Kategorien mit Icons und Attributdefinitionen
- KML/KMZ-Import fuer POIs
- POI-Anzeige und Interaktion in Karten- und Routenplanungsansichten
- API-Endpunkte unter `web/src/routes/api/v1/poi*`
- deutsch- und englischsprachige UI-Texte fuer die experimentellen Bereiche

## Beziehung zum Hauptprojekt

wanderer selbst ist eine self-hosted Trail-Datenbank. Tracks koennen hochgeladen,
erstellt, durchsucht, visualisiert und mit Metadaten organisiert werden. Alle
grundlegenden Funktionen, Setup-Hinweise und Projektentscheidungen stammen aus
dem upstream Projekt:

- Haupt-Repository: [open-wanderer/wanderer](https://github.com/open-wanderer/wanderer)
- Dokumentation: [wanderer.to](https://wanderer.to)
- Lizenz: [AGPLv3](LICENSE)

Issues, Feature-Diskussionen und Support fuer wanderer gehoeren grundsaetzlich
ins Haupt-Repository. Rueckmeldungen zu den experimentellen POI-Erweiterungen
sind in diesem Fork besser aufgehoben.

## Lokale Nutzung

Zum Ausprobieren dieses Forks sollte der Code aus diesem Repository gebaut
werden. Die veroeffentlichten Docker-Images des Hauptprojekts enthalten die
POI-Erweiterungen dieses Forks nicht automatisch.

```bash
git clone https://github.com/desolator7/wanderer-poi.git
cd wanderer-poi
```

Fuer die Entwicklungsumgebung und den Aufbau der Services gelten weiterhin die
upstream Hinweise zur Installation aus dem Quellcode:
[Local development](https://wanderer.to/develop/local-development).

## Hinweise fuer Mitwirkende

Dieser Fork ist bewusst klein gehalten: Aenderungen sollten moeglichst klar auf
das POI-Experiment bezogen sein. Wenn eine Aenderung nicht POI-spezifisch ist,
sollte sie nach Moeglichkeit upstream in
[open-wanderer/wanderer](https://github.com/open-wanderer/wanderer)
diskutiert werden.
