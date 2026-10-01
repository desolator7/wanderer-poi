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
