# PWA live mode

## Startup behavior

The installed PWA uses /pwa-start.html as its fixed entry point. This file is
a static asset that is added to the versioned cache when the service worker
is installed. The start router can therefore load before a SvelteKit page or
API response is required.

The start router reads the local live-mode snapshot:

- If a valid active snapshot exists, it opens /live.
- If an ended live session is stored and the device is offline, it shows a
  local notice where the last session can be reopened.
- If no live session is active and the device is online, it opens /.
- If neither an active nor an ended session is stored and the device is
  offline, it shows the local notice without a recovery action.

The manifest ID remains /, so the PWA keeps a stable application identity
regardless of its technical start path.

## Local route snapshot

When live mode starts, the route editor stores a versioned snapshot in
localStorage under the key wanderer-pwa-live-route. The snapshot contains:

- the route ID,
- the return path to the route editor,
- the selected live zoom level,
- the offline map profile and SHA-256 route fingerprint,
- the route name,
- the planned total duration in seconds, if available in the editor,
- the complete GPX data.

The editor first saves the route to the server. Only after a successful save
does it create the local snapshot and open /live. If the browser cannot write
the snapshot because of its local storage limit, the editor remains open and
shows an error.

## Offline shell

The service worker keeps /live as a separate cache entry. It tries to load the
shell during installation and requests it again when live mode starts so it is
available for a later offline launch. Static JavaScript, CSS, font, and icon
resources use the same versioned cache.

The live page does not load its route geometry through the trail API. It builds
the trail model from the local GPX snapshot and starts MapLibre geolocation
with high accuracy.

After a client-side navigation from the route editor, the live page stabilizes
the iOS standalone viewport after the first render. MapLibre also receives a
new resize() call after delayed resize, visualViewport, and orientation
changes so the map fills the available screen in portrait and landscape.

## Map behavior

Live mode provides four map choices. Near uses zoom 17, Medium uses zoom 15,
and Wide uses zoom 14. These three modes show the configured online map. Wide
(Offline) also uses zoom 14, but switches to the cached OpenTopoMap raster
style. Switching between online and offline styles rebuilds the map so that
sources and layers from the previous style are not retained.

The offline style requests only zoom levels 12 through 15. When zooming in
further, MapLibre enlarges the existing zoom-level 15 tiles. Tile downloading
continues in the background regardless of the selected map view, so Wide
(Offline) is ready as soon as the download completes.

When a tile is missing from the cache, the local MapLibre background remains
visible in its place. The following elements remain available:

- the saved route,
- start and destination markers,
- the current device position,
- the four local zoom and map modes,
- the route name, progress displays, elevation profile, offline status, and
  close control.

Other base maps, overlays, terrain, Overpass, and external glyphs are disabled
only in Wide (Offline). The three online modes use the regular map features.
New map areas require a network connection; previously viewed areas may be
available from the temporary runtime cache.

## Temporary runtime cache

In Near, Medium, and Wide modes, the live page marks only map resources
requested by MapLibre. These include style files, raster and vector tiles,
glyphs, sprites, terrain, and tile-based overlays. Regular application and
Overpass API requests are not captured. Before making a request, the service
worker removes its internal marker so it is not sent to the map provider.

The cache stores only resources requested during visible map use. It does not
preload more areas, route corridors, or zoom levels. Built-in and custom map
sources are treated the same way. Instance operators must check whether their
configured sources' terms allow this local caching.

Responses with no-store are not saved. Cache-Control, Expires, no-cache, and
must-revalidate remain in effect. If no usable lifetime is available, or the
browser cannot read the headers of an opaque response, a seven-day fallback
is used. Expired resources are not served offline.

The runtime cache is limited to 100 MB and keeps at least 10 MB of browser
storage available when the Storage Estimate API is supported. It removes
expired resources first, followed by the least recently used resources. The
cache has no readiness indicator because its contents are opportunistic and
never guaranteed to be complete. The cache status shown in Wide (Offline)
refers only to the prepared route cache. Both caches use separate Cache Storage
entries and are removed together by the Clear PWA cache action. This also
removes the local route snapshot and any recovery marker.

## Bounded tile cache

After /live opens, the PWA calculates a 500-metre corridor from the GPX
segments. The download starts in the background while the route, GPS tracking,
and controls remain usable. It covers the complete route at zoom 12 first,
then attempts zoom levels 13, 14, and 15. If a complete next level would exceed
the tile limit, that level is skipped; the downloader does not favor a partial
section of the route.

The profile has these limits:

- 1,200 tiles maximum,
- 60 MB maximum of actual response data,
- two concurrent download requests maximum,
- 10 MB of storage reserved for other application data.

Before downloading, the PWA tries to obtain persistent browser storage. If
storage runs low, the network is lost, or the provider applies a limit, the
available partial cache remains usable. The live-mode status shows progress
and errors and offers Cancel download or Retry. An icon row in Wide (Offline)
also shows cache status: a blue spinner, green check mark, yellow warning, or
red error. After a successful download, the detailed status bar disappears.
An aborted or interrupted download resumes from the cache manifest the next
time the app starts online.

Only the cache for the active route is managed. An unchanged route reuses its
cache; a different or changed route replaces it. Ending live mode keeps the
current cache for a later session on the same route.

Raster images and the cache manifest are stored in Cache Storage.
localStorage holds only the small route snapshot and is not suitable for
binary data. If the operating system closes or suspends the PWA, no further
background download is guaranteed. The saved state is reconciled on the next
launch.

OpenTopoMap permits use in applications with visible attribution and asks users
not to overload its public server with bulk downloads. The small profile and
download limits are intended to respect this guidance. See the
[OpenTopoMap usage notes](https://services.opentopomap.org/about/).

## Position and permissions

The current position comes from the device Geolocation API, not from the local
snapshot. GPS can work without internet access. Availability and accuracy
depend on the device, operating system settings, granted location permission,
and current reception.

The application does not store a position history. It uses MapLibre's
continuous position events for the marker, map viewport, and route progress.
The last valid route position remains only in the live page's memory, including
when changing map modes rebuilds the map. After a full restart, it is
calculated from the new GPS position.

## Route progress and elevation profile

The compact panel at the top has two horizontally swipeable pages. The first
shows remaining time, remaining distance, and distance travelled from the
route start. The second shows the full route elevation profile with a position
line and elevation marker. Page indicators can be clicked or operated with a
keyboard. The route name and close control remain visible on both pages.
MapLibre controls stay on the right, with status messages and the scale below
the panel. Safe areas are supported in portrait and landscape orientations.

“Distance travelled” means the route distance from its start to the current
position, even if the session began partway through the route. It does not
record the distance actually walked. The position is projected onto the
connections between GPX points. Gaps between separate segments do not
contribute to route length. Walking backwards reduces progress and increases
the remaining distance.

Position matching allows a lateral distance of 50 metres. With less accurate
GPS, the tolerance increases according to reported accuracy up to 100 metres.
When route sections are nearly equally close, within 10 metres of each other,
the previous route position helps choose between them. Without a previous
position, the earliest matching section in route order is selected. A start on
a shared outbound and return section may therefore be ambiguous at first.

Values are not updated when the position is too far from the route, GPS
accuracy is worse than 100 metres, a location error occurs, or no current
position has been received for more than 30 seconds. A notice marks the
displayed values and profile marker as the last valid state. Placeholders are
shown if no valid position has been received. Calculation resumes
automatically when the position becomes valid again.

Remaining time uses complete, valid GPX time series for the remaining
segments. A total duration entered in the editor scales those time series. If
no suitable time series is available, the planned total duration is divided
according to the remaining distance. If neither is available, the display says
that no schedule is available. The estimate does not adapt to actual walking
speed and does not count down during a pause. Distance formatting follows the
active locale; durations use hours and minutes.

The elevation profile uses only GPX elevations. Missing elevations and
separate segments remain visible as gaps; missing values are not replaced with
zero. If the current position is in an elevation gap, only its distance marker
is shown. A notice appears when no elevation data is available. Progress,
time estimates, and the elevation profile require no network requests.

## Ending a session

When live mode ends, the application keeps the local snapshot and marks it
inactive. It does not create another copy of the GPX data. If the device is
online, the app opens the saved route editor. If it is offline, it returns to
the local start router, which shows that no offline route is active and offers
to resume the last live session.

The recovery action removes only the inactive marker and opens /live; the
route snapshot remains stored. The same session can therefore be recovered
again after a later exit. If the device reconnects while the notice is open,
the start router resumes its normal behavior and opens /.

## Checks after an update

Changes to the web app manifest are not always picked up by a regular reload
on iOS. For a reliable check, remove the PWA from the Home Screen and install
it again.

Check these states:

- online launch without an active live session,
- online launch with an active live session,
- offline cold launch with an active live session,
- offline cold launch without an active live session,
- recovery of the last ended session while offline,
- return to the home page when the recovery notice reconnects,
- location permission granted, denied, and not yet decided,
- ending live mode online and offline,
- Near, Medium, Wide, and Wide (Offline) modes,
- switching between the regular online map and cached OpenTopoMap,
- reuse of viewed online map resources after a connection is interrupted,
- expiry and LRU cleanup of the temporary runtime cache,
- complete, aborted, and resumed tile downloads,
- low storage, network loss, and provider limits,
- portrait and landscape layouts in the installed iOS PWA,
- swiping between metrics and elevation and operating map controls,
- GPS deviations, poor reception, and recovery after a location error,
- stable progress and page selection after changing map modes.

Automated browser checks use a local test route and simulated GPS events
without modifying production routes:

~~~bash
cd web
LIVE_MAP_TEST_URL=http://localhost:3000 npx playwright test tests/playwright/live-map.spec.ts --project=chromium --no-deps --workers=1
~~~

These checks cover narrow mobile layouts, landscape, simulated safe areas,
location errors, and offline transitions. A check on an installed iOS PWA
complements the Chromium checks.
