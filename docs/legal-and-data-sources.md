# Rechtliches und Datenquellen

## Geltungsbereich

Dieses Dokument beschreibt den aktuellen Stand der rechtlichen Hinweise und
der bereitgestellten POI-Daten in diesem Fork. Die Anwendung stellt dieselben
Kernhinweise öffentlich unter `/legal` bereit. Die Route bleibt auch erreichbar,
wenn die Instanz mit `PUBLIC_PRIVATE_INSTANCE=true` betrieben wird.

Die Hinweise sind keine vollständigen Anbieterangaben und keine individuelle
Rechtsberatung. Betreiber einer eigenen Instanz müssen prüfen, welche weiteren
Angaben und Pflichten für ihren konkreten Betrieb gelten.

## Unabhängigkeit

Dieser experimentelle wanderer-POI-Fork ist ein unabhängiges Softwareprojekt.
Er wird weder von der Harzer Wandernadel GmbH noch von anderen Vereinen,
Markeninhabern oder Betreibern der genannten Points of Interest betrieben,
beauftragt, unterstützt oder verantwortet.

Namen und Bezeichnungen von Orten, Stempelstellen oder anderen POIs dienen der
Beschreibung und geografischen Zuordnung. Ihre Nennung begründet keine
organisatorische, wirtschaftliche oder sonstige offizielle Verbindung. Der
gesetzliche Rahmen für die beschreibende Verwendung von Kennzeichen ist unter
[§ 23 Markengesetz](https://www.gesetze-im-internet.de/markeng/__23.html)
abrufbar.

## Bereitgestellter POI-Datenbestand

Das Projekt stellt als vorbefüllten POI-Datenbestand ausschließlich den aus
OpenStreetMap abgeleiteten Snapshot `/data/osm-stamp-points.json` bereit. Dieser
Snapshot ist kein offizieller Datensatz der Harzer Wandernadel GmbH, eines
Vereins oder eines anderen POI-Betreibers. Er bildet die zugrunde liegenden
OpenStreetMap-Daten nur zum Zeitpunkt seiner Erstellung ab.

Der Snapshot kann unvollständige, unrichtige, veraltete oder mehrfach erfasste
Angaben enthalten. Aus seiner Bereitstellung folgt keine Zusicherung zu
Vollständigkeit, Richtigkeit, Aktualität, Verfügbarkeit oder Eignung für einen
bestimmten Zweck. Für Wanderungen und andere Aktivitäten sind die tatsächlichen
Gegebenheiten, Sperrungen, Beschilderungen und Hinweise der zuständigen Stellen
maßgeblich.

### Abgrenzung zur offiziellen GPS-Datei

Die auf der offiziellen Seite veröffentlichten
[GPS-Nutzungsbedingungen](https://www.harzer-wandernadel.de/stempelstellen/gps-download/)
wurden bei der Quellenabgrenzung berücksichtigt. Die dort angebotene
GPX-/GPI-Datei ist weder Quelle dieses Snapshots noch Abgleichs- oder
Vollständigkeitsmaßstab. Sie wird für Erzeugung, Prüfung und Import des
OSM-Datenbestands nicht heruntergeladen oder verarbeitet.

## Inhalte von Nutzern

Nutzer einer Instanz können eigene POIs und weitere Inhalte anlegen oder
vorhandene Angaben bearbeiten. Diese Inhalte sind vom bereitgestellten
OSM-Snapshot zu unterscheiden. Sie stammen von den jeweils einstellenden
Nutzern und werden durch das Projekt nicht vollständig geprüft. Das Projekt
gibt für nutzergenerierte Inhalte keine Zusicherung zu Richtigkeit,
Vollständigkeit, Rechtmäßigkeit, Aktualität oder dauerhafter Verfügbarkeit.

Der jeweilige Instanzbetreiber legt Registrierung, Sichtbarkeit und Moderation
für seine Installation fest. Daraus entsteht keine Verantwortung der Harzer
Wandernadel GmbH, anderer Vereine, Markeninhaber, POI-Betreiber oder des
OpenStreetMap-Projekts für diese Nutzerinhalte.

## OpenStreetMap-Attribution und ODbL

Die im Snapshot enthaltenen Geodaten basieren auf Daten von
[© OpenStreetMap-Mitwirkenden](https://www.openstreetmap.org/copyright).
OpenStreetMap-Daten stehen unter der Open Data Commons Open Database License
(ODbL) 1.0. Die erforderliche Namensnennung muss auf OpenStreetMap und dessen
Mitwirkende hinweisen. Bei öffentlicher Nutzung oder Weitergabe sind außerdem
die jeweils anwendbaren Lizenz- und Share-Alike-Bedingungen zu beachten.

Maßgebliche Informationen:

- [OpenStreetMap Attribution Guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)
- [Open Data Commons ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- [OpenStreetMap Substantial Guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Substantial_-_Guideline)

Ob eine konkrete Entnahme oder Weiterverwendung wesentlich ist und welche
Pflichten daraus folgen, hängt von der tatsächlichen Verwendung ab. Neben der
ODbL können Datenbankrechte relevant sein; siehe
[§ 87b Urheberrechtsgesetz](https://www.gesetze-im-internet.de/urhg/__87b.html).

## OpenTopoMap-Kartenkacheln

Der PWA-Livemodus kann einen kleinen, auf die aktive Route begrenzten
Offlinecache mit Rasterkacheln von
[OpenTopoMap](https://www.opentopomap.org/) anlegen. Die Kartenansicht zeigt die
Namensnennung für OpenTopoMap und OpenStreetMap an. Das Downloadprofil ist auf
einen 500-Meter-Routenkorridor, die Zoomstufen 12 bis 15, 1.200 Tiles und 60 MB
begrenzt. Der öffentliche Dienst wird ohne Zusicherung dauerhafter
Verfügbarkeit genutzt. Betreiber müssen die
[Nutzungshinweise von OpenTopoMap](https://services.opentopomap.org/about/)
beachten.

## Flüchtiger Cache für Onlinekarten

Die Online-Modi des PWA-Livemodus speichern ausschließlich Kartenressourcen,
die MapLibre während der sichtbaren Nutzung tatsächlich anfordert. Es werden
keine zusätzlichen Gebiete oder Zoomstufen vorgeladen. Die Anwendung beachtet
auswertbare HTTP-Cachevorgaben; ohne auswertbare Laufzeit gilt ein Fallback von
sieben Tagen. Der separate Runtime-Cache ist auf 100 MB begrenzt und entfernt
abgelaufene beziehungsweise zuletzt lange nicht verwendete Einträge.

Diese technische Zwischenspeicherung gilt automatisch auch für durch einen
Instanzbetreiber konfigurierte Kartenquellen. Sie ist keine Aussage darüber,
ob ein Anbieter die konkrete Nutzung gestattet. Betreiber müssen die
Lizenz-, Namensnennungs- und Nutzungsbedingungen jeder eingebundenen Quelle
selbst prüfen. Quellen mit einem ausdrücklichen Verbot lokaler Speicherung
dürfen nicht als Kartenquelle konfiguriert werden.

## Sichtbarkeit in der Anwendung

Der globale Footer enthält einen dezenten Link zu `/legal` und einen separaten
Link zum [Quellcode dieses Forks](https://github.com/desolator7/wanderer-poi).
Die bestehenden Links zum Upstream-Projekt und dessen About-Seite bleiben davon
unberührt. Die Rechtseite trägt die Kennzeichnung `Ver. 161.26.013`.
