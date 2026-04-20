# Changelog

Dieses Changelog dokumentiert nur die fork-spezifischen Aenderungen in
[desolator7/wanderer-poi](https://github.com/desolator7/wanderer-poi).

Das vollstaendige Changelog des Hauptprojekts befindet sich im upstream
Repository:
[open-wanderer/wanderer/CHANGELOG.md](https://github.com/open-wanderer/wanderer/blob/main/CHANGELOG.md).

## Unreleased - experimenteller POI-Fork

### Added

- Experimentelles POI-Modul fuer wanderer.
- Neue PocketBase-Collections fuer `pois`, `poi_categories` und
  `poi_attributes`.
- Datenbankmigrationen fuer POI-Erstellung, Zugriffsregeln, Marker-Styling und
  Attributdefinitionen.
- POI-Uebersichtsseite mit Karte, Liste, Suche, Kategorieauswahl und
  Sichtbarkeitsfiltern.
- POI-Dialog zum Erstellen und Bearbeiten von Name, Beschreibung, Standort,
  Kategorie, Icon, Farbe, Sichtbarkeit und Attributen.
- Einstellungsseite fuer POI-Kategorien und deren Attributschema.
- KML/KMZ-Import fuer POIs mit Kategorie-, Icon- und Sichtbarkeitsauswahl.
- API-Routen fuer POIs, POI-Kategorien, POI-Attribute und POI-Import.
- POI-Marker in Kartenansichten inklusive Popup-/Bearbeitungslogik.
- POI-Interaktion im Routenplaner.
- Deutsche und englische Uebersetzungen fuer die neuen POI-Oberflaechen.

### Changed

- Navigation und Einstellungsbereich enthalten neue POI-Einstiege.
- Kartenkomponenten koennen neben Trails und Waypoints auch POIs darstellen.
- Marker-Utilities unterstuetzen POI-Icons und POI-Farben.
- Such- und API-Hilfslogik wurde um POI-Modelle erweitert.

### Fixed

- Zugriffsregeln fuer oeffentliche und eigene POIs wurden nachgeschaerft.
- Migrationsreihenfolge fuer POI-Collections wurde korrigiert.
- Primaere POI-Attribute werden konsistenter behandelt.
- POI-Markersteuerung und Uebersetzungen wurden verfeinert.

### Notes

- Dieser Stand ist experimentell und nicht als offizieller wanderer-Release zu
  verstehen.
- Teile dieser Aenderungen wurden mit Hilfe eines KI-Agenten erstellt und
  sollten vor produktiver Nutzung reviewed und getestet werden.
