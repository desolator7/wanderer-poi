# Containerbetrieb

Die regelmäßigen Docker-Healthchecks von `web` laufen alle 300 Sekunden. In der Startphase erfolgen Prüfungen alle fünf Sekunden.

Für `db`, `search` bleiben die kürzeren Intervalle erhalten, weil andere Dienste beim Stack-Start auf `service_healthy` warten.

Die laufenden Dienste verwenden den Docker-Logtreiber `json-file` mit höchstens drei Dateien zu jeweils 20 MB pro Container. Die Rotation wird bei der Container-Erstellung eingerichtet.

Der Webcheck ruft mit `curl` `/healthz` auf. Der Server beantwortet GET und HEAD vor den Authentifizierungs- und Datenbank-Hooks; andere Methoden erhalten HTTP 405. Der vorhandene Valhalla-Router ist als Dienst `valhalla` mit seinem Datenverzeichnis und Port 8002 in der Compose-Datei enthalten.

## Einstellungen anwenden

```sh
docker compose up -d --no-build --pull never --force-recreate
```

Bei geänderten Anwendungsquellen zuerst den betroffenen Dienst gezielt bauen. Die Compose-Datei legt die Intervalle und Loggrenzen fest; ein bloßer Container-Neustart übernimmt diese Einstellungen nicht.

## Anwendungs- und Plugin-Build

Die lokalen Images heißen `wanderer-poi-web:local` und `wanderer-poi-db:local`.
Sie werden nicht von Watchtower aktualisiert. Die Compose-Datei erhält die
Routing-Konfiguration, den Valhalla-Dienst und die lokalen Datenverzeichnisse.

```sh
make web-build-docker db-build-docker
make plugins-install-local
docker compose up -d --no-build --pull never --no-deps --force-recreate db web
```

`plugins-install-local` ersetzt ausschließlich die drei mitgelieferten Bundles
in `data/plugins`. Dafür müssen Go 1.26 und TinyGo 0.41.1 im `PATH` verfügbar
sein. Web und Datenbank verwenden denselben `POCKETBASE_PROXY_SECRET` aus der
lokalen `.env`; ein bestehender Wert darf bei einem gewöhnlichen Neustart
nicht neu erzeugt werden.

## Sicherung und Wiederherstellung

Vor einem Versionswechsel werden Web und Datenbank angehalten, damit
`data/pb_data` einschließlich Dateispeicher konsistent gesichert werden kann.
Zur Sicherung gehören außerdem `.env`, `docker-compose.yml`, `data/uploads`
und die installierten Plugin-Bundles. Sicherungen enthalten Zugangsdaten und
werden nur mit eingeschränkten Dateirechten lokal gespeichert.

Die bisherigen Datenbank- und Web-Images erhalten vor dem Build separate
Sicherungstags. Diese Tags bleiben nach erfolgreicher Aktualisierung erhalten;
die Bereinigung betrifft nur nicht mehr benötigte Build-Artefakte.

Bei einem fehlgeschlagenen Upgrade werden Web und Datenbank wieder angehalten.
Die gesicherte Datenbank mit Dateispeicher und die gesicherte Konfiguration
werden gemeinsam zurückgespielt. Anschließend werden die bisherigen Images
wieder als `:local` getaggt und beide Container neu erstellt. Eine migrierte
Datenbank darf nicht mit dem vorherigen Datenbank-Image gestartet werden.
