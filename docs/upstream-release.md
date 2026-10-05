# Upstream release and fork behavior

The application is based on upstream **v0.21.0**, commit `a93566bc`, with the
fork version **0.21.0 Ver. 161.26.025**. This version is shown in small text
under `/legal`.

## Categories and automatic calculations

All upstream categories and subcategories are available. The category and
routing profile are configured separately: Hiking and Walking use the
pedestrian profile, while Biking uses the bicycle profile. The MTB and E-Bike
subcategories select their respective bicycle profiles, which can be adjusted.

For all sports, distance and elevation gain are calculated from the route
geometry. The application calculates duration automatically with the
pedestrian or bicycle profile. For Running, Skiing, Canoeing, Climbing, Other,
and custom categories, it keeps the imported or manually entered duration and
disables automatic routing.

The application evaluates SAC difficulty only for Hiking when the routing data
provides a rating. Otherwise, it keeps the difficulty from the import or
manual entry.

## Personal completion status

A trail is marked as completed for a signed-in user if that user has a summit
log for it or manually marks a trail they own as completed. Manually marking
another user's trail does not count as a personal activity. Anonymous users
do not have a personal completion status.

The upstream `completed` and `completed_at` trail fields remain unchanged.
The personal status is calculated using the signed-in user and their summit
logs. Statistics count the user's summit logs and include manually completed
trails only when there is no summit log for the same trail.

## Plugin imports

The Komoot, Strava, and Hammerhead bundles are built from `plugins/`. The
database discovers them in `/data/plugins`, which is mounted persistently from
`data/plugins`. Plugin settings are available under `/settings/plugins`.
Existing plugin instances retain their credentials and configuration.

The shared import process handles:

- `config.host.excludedTrailIds`: source IDs that a plugin instance must not
  import again. The settings accept one ID per line.
- Duplicate detection by user, provider, and source ID for both trails and
  already-linked summit logs.
- Summit logs for completed activities, including the GPX file, provider, and
  external source ID.
- Creating a summit log when an imported planned trail later appears as an
  activity, while keeping the planned route geometry.
- Creating waypoints from GPX geometry when the provider supplies no waypoints.
- Saving source IDs to the user's matching plugin instances as exclusions
  before an imported trail is deleted, including when it is linked to a summit
  log.

The trail menu still provides the action to link a trail to a summit log.
Existing summit logs are moved to the target trail. If there is no summit log,
the action creates one from the trail data and GPX file.

## Runtime and database

The database requires Go 1.26; the WASM bundles require TinyGo 0.41.1. The web
dependencies match the upstream release. The web and database services use the
same randomly generated `POCKETBASE_PROXY_SECRET` from the local `.env` file.
The file and runtime data are not version controlled.

The upstream migrations are unchanged. PocketBase applies pending migrations
when the database starts. This release has no additional fork migration. POIs,
attributes, summit logs, categories, and identity-provider links remain in the
existing database.

See [Container operations](container-operations.md) for build, backup, and
restore instructions.
