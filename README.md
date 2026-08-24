# wanderer POI fork

This repository contains an independent, experimental fork of
[open-wanderer/wanderer](https://github.com/open-wanderer/wanderer).

The fork adds first-class Points of Interest (POIs) to wanderer. A POI is a
stored geographic record with coordinates, a name, a description, a category,
visibility, and optional attributes.

This is not an official wanderer project. The upstream team does not maintain
this fork. Use the [upstream repository](https://github.com/open-wanderer/wanderer)
for the stable project, official documentation, published Docker images,
support channels, and upstream release information.

## Purpose and scope

wanderer is a self-hosted trail database. It supports trail upload, trail
creation, search, map display, and metadata management.

The basic trail features, setup guidance, and project decisions come from the
upstream project.

The fork tests a separate data model for places that users want to keep beside
their trails. Examples include viewpoints, shelters, water sources, trail
heads, landmarks, and other locations.

The POI work keeps the upstream trail features and adds the following parts:

- a POI data model in PocketBase
- a POI list and map view in the web application
- category and attribute configuration
- public and private POI visibility
- KML and KMZ import
- POI markers in the global map
- POI selection in the trail route editor
- API routes for POIs, categories, attributes, and imports

The fork focuses on local POI records. It does not define a separate product,
a stable public API, or a replacement for the upstream project.

## Current status

This fork is an experiment. The implementation, database schema, access rules,
and API contracts can change at any time.

Review the code before you use this fork with important data. Build the local
Docker images from this repository because the upstream images do not include
the POI changes.

Some implementation and documentation changes use AI assistance. Review and
test these changes as you would review any other contribution.

The current POI UI includes English and German text. Other translations can be
incomplete for the experimental POI areas.

## Rechtliches und Datenquellen

Der Fork ist unabhängig von der Harzer Wandernadel GmbH und anderen Vereinen
oder POI-Betreibern. Als vorbefüllter POI-Datenbestand wird ausschließlich der
OpenStreetMap-basierte Snapshot `data/osm-stamp-points.json` bereitgestellt. Die
Anwendung zeigt die Hinweise zu Unabhängigkeit, Datenqualität und ODbL unter
`/legal`. Der aktuelle rechtliche und technische Ist-Stand ist in
[Rechtliches und Datenquellen](docs/legal-and-data-sources.md) beschrieben.

## POI features

### POI records

The `/pois` route shows POIs in a list and on a MapLibre map. The page uses a
split layout on larger screens and a stacked layout on smaller screens.

Each POI can contain the following data:

- a required name
- an optional description
- an optional location label
- latitude and longitude
- a category
- a marker icon
- a six-digit hexadecimal marker color
- public or private visibility
- category-specific attribute values
- the author and creation dates

Signed-in users can create POIs from the map. The user selects map edit mode,
clicks a location, and enters the POI data in the edit dialog.

Users can edit and delete their own POIs. Users can also drag their own POI
markers to a new location while map edit mode is active.

The map popup can show the POI attributes. The popup lets the owner edit the
attribute values that the current access rules allow.

### Search and filters

The POI page supports text search in the name, description, and location label.

Users can filter the result by one or more POI categories. Signed-in users can
also include or exclude public POIs and their own POIs.

The same category and visibility filters are available on the global map and in
the trail route editor.

### Bulk changes

Signed-in users can select several of their own POIs. The selection supports the
following actions:

- select all matching POIs
- clear the selection
- delete the selected POIs
- change visibility for the selected POIs
- move the selected POIs to another category
- overwrite selected attribute values

Bulk attribute editing applies to POIs in one category. The page shows the
attribute definitions for that category before it applies a change.

### Categories

The `/settings/pois` route lets users manage their own POI categories.

A category contains a name, a description, an icon, and an author. The icon
comes from the icon set that the application already uses.

Categories organize the POI list and control which attribute definitions apply
to a POI.

### Attribute definitions

Users can define attributes for each category. The current data model supports
these attribute types:

- string
- boolean
- date

Each attribute has a display name and a lowercase key with letters, numbers,
and underscores. The key is unique within its category.

An attribute can use public or private value storage. A public attribute can
allow writes from all users or from administrators only.

A boolean attribute can be marked as the primary color marker for its category.
Only one primary color marker can exist in a category.

The server applies the current user's private attribute value when it builds a
POI response. The attribute access rules also control which user can change a
value.

### KML and KMZ import

Signed-in users can import one or more `.kml` or `.kmz` files from the POI page.

Before the import, the user selects a category and public or private visibility.
The importer creates one POI for each supported point feature.

The importer reads common KML properties for the POI name, description, and
marker color. Matching properties can also fill the configured category
attributes.

The import route accepts KML data from a plain KML file or from a KMZ archive.
For a KMZ archive, the importer uses `doc.kml` when the file contains it. It
uses another KML file in the archive when `doc.kml` is not available.

The current UI accepts KML and KMZ files for POI import. It does not expose a
separate GPX or FIT import for POI records.

### Map and route editor integration

The global `/map` route renders POI markers together with trail data. Users can
filter the markers by category and visibility.

The trail editor renders the selected POIs beside the trail and waypoint data.
Users can filter the available POIs before they use one in the route editor.

When a user selects a POI in the trail editor, the editor uses its coordinates
as the location for a route-point action.

The map component supports POI markers, popups, category attributes, owner
editing, and owner-only marker movement.

## Data model

The fork adds three PocketBase collections:

| Collection | Purpose |
| --- | --- |
| `pois` | Stores geographic POI records and their values. |
| `poi_categories` | Stores POI categories and category icons. |
| `poi_attributes` | Stores the attribute definitions for each category. |

The `pois` collection stores the following main fields:

- `name`
- `description`
- `location`
- `lat`
- `lon`
- `public`
- `category`
- `author`
- `attributes`
- `private_attributes`
- `icon`
- `color`

The web layer validates POI input with Zod schemas. Latitude values must be in
the range `-90` to `90`. Longitude values must be in the range `-180` to
`180`. Marker colors use the form `#RRGGBB`.

The database migrations for the POI collections are in
`db/migrations/1772300001_created_pois.go` and the following
`1772300002` to `1772300005` migration files.

PocketBase applies these migrations when the database service starts. Do not
copy only the web image into an existing upstream installation and expect the
POI collections to exist.

## Visibility and access rules

The access rules use the POI author and the `public` field.

- Anonymous users can read public POIs.
- Signed-in users can read public POIs and their own private POIs.
- Users can create POIs only for their own account.
- Users can update and delete only their own POIs.
- Users can update and delete only their own categories.
- Users can update and delete only their own attribute definitions.

Categories and attribute definitions become readable to other users when they
are attached to public POIs. This lets the public POI view render the category
name, icon, and configured attributes.

Treat private POIs and private attribute values as experimental behavior until
you review the current access rules for your deployment.

## API routes

The POI API lives below `web/src/routes/api/v1`.

| Method and route | Purpose |
| --- | --- |
| `GET /api/v1/poi` | List POIs and apply PocketBase filters. |
| `PUT /api/v1/poi` | Create a POI for the signed-in user. |
| `GET /api/v1/poi/:id` | Read one POI. |
| `POST /api/v1/poi/:id` | Update one POI. |
| `DELETE /api/v1/poi/:id` | Delete one POI. |
| `PUT /api/v1/poi/import` | Import POIs from a KML or KMZ upload. |
| `GET /api/v1/poi-category` | List POI categories. |
| `PUT /api/v1/poi-category` | Create a POI category. |
| `POST /api/v1/poi-category/:id` | Update a POI category. |
| `DELETE /api/v1/poi-category/:id` | Delete a POI category. |
| `GET /api/v1/poi-attribute` | List attribute definitions. |
| `PUT /api/v1/poi-attribute` | Create an attribute definition. |
| `POST /api/v1/poi-attribute/:id` | Update an attribute definition. |
| `DELETE /api/v1/poi-attribute/:id` | Delete an attribute definition. |

The routes use the existing SvelteKit API layer and PocketBase access rules.
The route names and request schemas can change while the fork remains
experimental.

## Repository structure

| Path | Purpose |
| --- | --- |
| `web/` | SvelteKit web application and POI UI. |
| `web/src/routes/pois/` | POI list, map, search, import, and bulk actions. |
| `web/src/routes/settings/pois/` | POI category and attribute configuration. |
| `web/src/routes/api/v1/poi/` | POI and import API routes. |
| `web/src/lib/models/poi.ts` | POI model and filter type. |
| `web/src/lib/models/poi_category.ts` | POI category model. |
| `web/src/lib/models/poi_attribute.ts` | POI attribute model and value types. |
| `web/src/lib/stores/poi_store.ts` | Client calls for POI operations. |
| `web/src/lib/util/poi_util.ts` | Import, normalization, filtering, and display helpers. |
| `db/` | Go PocketBase application and database migrations. |
| `db/migrations/` | PocketBase schema and data migrations. |
| `docker-compose.yml` | Local Docker services for this fork. |
| `Makefile` | Build, check, and test commands. |

The web application uses SvelteKit, TypeScript, Svelte, MapLibre GL, and
PocketBase client APIs. The database service uses PocketBase in a Go
application. Meilisearch provides the existing trail search service.

## Local Docker use

### Requirements

Install the following tools before you start:

- Git
- Docker Engine
- Docker Compose
- OpenSSL for local key generation

Get the clone URL from the repository's GitHub **Code** menu.

### Configure the services

Create a `.env` file in the repository root. Set these required values:

~~~dotenv
MEILI_MASTER_KEY=replace-with-a-random-value-of-at-least-32-characters
POCKETBASE_ENCRYPTION_KEY=replace-with-32-characters
ORIGIN=http://localhost:3000
~~~

`POCKETBASE_ENCRYPTION_KEY` must contain exactly 32 bytes. Generate a local
value with the following command:

~~~bash
openssl rand -hex 16
~~~

Use a different secure value for a shared or production deployment. Set
`ORIGIN` to the complete public URL of the web application, including the port.

### Build and start the fork

Run these commands from the repository root:

~~~bash
make db-build-docker
make web-build-docker
docker compose up -d
~~~

The compose file starts these services:

| Service | Local image | Port |
| --- | --- | --- |
| `search` | `getmeili/meilisearch:v1.36.0` | `7700` |
| `db` | `wanderer-poi-db:local` | `8090` |
| `web` | `wanderer-poi-web:local` | `3000` |

Open [http://localhost:3000](http://localhost:3000) after the services pass
their health checks.

The compose file stores PocketBase data in `data/pb_data`, Meilisearch data in
`data/data.ms`, and uploaded files in `data/uploads`. These paths are local
runtime data and are ignored by Git.

The compose file also configures Overpass, Valhalla, and Nominatim endpoints.
Set the related environment variables when your deployment uses different
services.

### Update the local images

Rebuild the image for each changed component. Restart the services after the
build completes.

~~~bash
make db-build-docker
make web-build-docker
docker compose up -d
~~~

The database image build compiles the Go application. The web image build
installs the Node dependencies and runs the SvelteKit production build.

## Development commands

Run these commands from the repository root:

~~~bash
make web-install
make web-check
make web-test
make db-test
make db-vet
make db-fmt
~~~

The web checks run `svelte-check`. The web tests run the Playwright integration
tests and the Vitest unit tests.

The database tests run the Go test suite. `db-vet` runs `go vet`. `db-fmt`
formats the Go code.

For the upstream development workflow, read the
[local development guide](https://wanderer.to/develop/local-development/).
Use the local fork Docker images when you need the POI collections and routes.

## Upstream relationship

The fork keeps the upstream project as its base. The following resources remain
the authoritative sources for the upstream product:

- Repository: [open-wanderer/wanderer](https://github.com/open-wanderer/wanderer)
- Documentation: [wanderer.to](https://wanderer.to)
- License: [AGPLv3](LICENSE)

Use the upstream issue tracker for general wanderer bugs, upstream features,
and upstream support questions.

Use this fork's issue tracker for the experimental POI implementation, POI
schema changes, and fork-specific behavior.

Do not assume that an upstream release, Docker image, migration, or API change
also contains the changes in this fork.

## Contributing

Keep changes focused on the POI experiment unless the change fixes a problem
that the upstream project also needs.

Before you submit a change, describe its user-facing behavior, test the changed
area, and list known limitations. Include migration details when a database
change requires a new PocketBase migration.

If a change is not POI-specific, discuss it in the upstream repository when
possible. This keeps the fork small and makes upstream comparison easier.

## License

This fork uses the [AGPLv3 license](LICENSE), in line with the upstream project.
