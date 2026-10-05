# Container operations

The `web` service runs scheduled Docker health checks every 300 seconds, with
checks every five seconds during startup.

The `db` and `search` services keep shorter intervals because other services
wait for them to become healthy during stack startup.

Running services use Docker's `json-file` logging driver, with at most three
files of 20 MB per container. Docker configures log rotation when it creates
the containers.

The web health check uses `curl` to request `/healthz`. The server handles GET
and HEAD before the authentication and database hooks; other methods receive
HTTP 405. The Compose file includes the Valhalla router as the `valhalla`
service, with its data directory and port 8002.

## Apply settings

~~~sh
docker compose up -d --no-build --pull never --force-recreate
~~~

For changed application source, build the affected service first. The Compose
file defines the health-check intervals and log limits, so restarting existing
containers alone does not apply those settings.

## Build the application and plugins

The local images are named `wanderer-poi-web:local` and `wanderer-poi-db:local`.
Watchtower does not update them. The Compose file also configures routing, the
Valhalla service, and persistent local data directories.

~~~sh
make web-build-docker db-build-docker
make plugins-install-local
docker compose up -d --no-build --pull never --no-deps --force-recreate db web
~~~

`plugins-install-local` replaces only the three bundled plugins in
`data/plugins`. Go 1.26 and TinyGo 0.41.1 must be available in `PATH`. The web
and database services use the same `POCKETBASE_PROXY_SECRET` from the local
`.env` file. Do not generate a new value during a routine restart.

## Backup and restore

Before changing versions, stop the web and database services so that
`data/pb_data`, including its file storage, can be backed up consistently.
Also include `.env`, `docker-compose.yml`, `data/uploads`, and the installed
plugin bundles. Backups contain credentials and must be stored locally with
restricted file permissions.

The existing database and web images receive separate backup tags before a
build. Keep those tags after a successful update; cleanup should remove only
unused build artifacts.

If an upgrade fails, stop the web and database services again. Restore the
database, its file storage, and the configuration together. Then retag the
previous images as `:local` and recreate both containers. Do not start a
migrated database with the previous database image.
