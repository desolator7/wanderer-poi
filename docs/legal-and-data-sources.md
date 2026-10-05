# Legal information and data sources

## Scope

This document describes the current legal notes and POI data distributed with
this fork. The application publishes the same core notices at `/legal`. That
route remains available when an instance runs with
`PUBLIC_PRIVATE_INSTANCE=true`.

These notes are not complete provider disclosures or individual legal advice.
Operators of their own instances must determine which additional notices and
obligations apply to their specific deployment.

## Independence

This experimental wanderer POI fork is an independent software project. It is
not operated, commissioned, endorsed, or controlled by the rights holders,
organizations, or operators associated with the Points of Interest represented
in the application.

Names and labels for places, markers, and other POIs are used to describe and
locate them. Their appearance does not imply an organizational, commercial, or
official relationship with a rights holder or operator.

## Distributed POI data

The project provides an OpenStreetMap-derived snapshot at
`/data/osm-stamp-points.json`. It is not an official dataset from any rights
holder, organization, or POI operator. It reflects the underlying
OpenStreetMap data only at the time the snapshot was created.

The snapshot may contain missing, inaccurate, outdated, or duplicate records.
Its availability does not guarantee completeness, accuracy, currency,
availability, or fitness for a particular purpose. For hikes and other
activities, follow current conditions, closures, signs, and notices from the
responsible authorities.

### Separation from third-party GPS files

Third-party terms of use for GPS downloads were considered when defining the
data sources. Such files are not a source for this snapshot and are not used
as a completeness or verification standard. They are not downloaded or
processed to create, check, or import the OpenStreetMap dataset.

## User-generated content

Users of an instance can create POIs and other content or edit existing
records. This content is separate from the distributed OpenStreetMap snapshot.
It comes from the users who submit it and is not fully reviewed by the project.
The project does not guarantee the accuracy, completeness, legality, currency,
or continued availability of user-generated content.

Each instance operator sets registration, visibility, and moderation policies
for their installation. The organizations and operators associated with POIs,
as well as the OpenStreetMap project, are not responsible for user-generated
content on an instance.

## OpenStreetMap attribution and ODbL

The geographic data in the snapshot is based on
[© OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
OpenStreetMap data is available under the Open Data Commons Open Database
License (ODbL) 1.0. Attribution must identify OpenStreetMap and its
contributors. Public use or redistribution must also follow the applicable
license and share-alike requirements.

Authoritative information:

- [OpenStreetMap Attribution Guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)
- [Open Data Commons ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- [OpenStreetMap Substantial Guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Substantial_-_Guideline)

Whether an extraction or reuse is substantial, and which obligations apply,
depends on the actual use. Database rights may also be relevant; see
[Section 87b of the German Copyright Act](https://www.gesetze-im-internet.de/urhg/__87b.html).

## OpenTopoMap tiles

PWA live mode can create a small offline raster-tile cache limited to the active
route. The map displays attribution for OpenTopoMap and OpenStreetMap. The
download profile is limited to a 500-metre route corridor, zoom levels 12
through 15, 1,200 tiles, and 60 MB. The public service is used without a
guarantee of continued availability. Instance operators must follow the
[OpenTopoMap usage notes](https://services.opentopomap.org/about/).

## Temporary cache for online maps

The online modes of PWA live mode store only map resources that MapLibre
requests during visible use. They do not preload additional areas or zoom
levels. The application follows readable HTTP cache directives; if no usable
lifetime is available, it uses a seven-day fallback. The separate runtime
cache is limited to 100 MB and removes expired or least-recently-used entries.

This technical caching also applies to map sources configured by an instance
operator. It does not establish whether a provider permits that use. Operators
must review the license, attribution, and usage terms for every configured
source. Do not configure sources that explicitly prohibit local storage.

## Application notice

The application footer links to `/legal`. Other project links point to the
upstream project's public resources. The legal page shows the current
application version.
