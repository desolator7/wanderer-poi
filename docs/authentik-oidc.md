# Authentik-OIDC-Anmeldung

## Aktiver Anmeldeweg

Die produktive Instanz unter `https://wanderer.example.org` verwendet
Authentik unter `https://auth.example.org` als einzigen interaktiven
Anmeldeweg. Die lokale Passwortanmeldung und die lokale Registrierung sind
deaktiviert.

Der Klick auf „Mit Authentik anmelden“ öffnet den eigenen Wanderer-Anmeldeflow.
Dort sind „Noch kein Konto? Registrieren.“ und „Benutzername oder Passwort
vergessen?“ verfügbar. Die Registrierung legt zunächst ein inaktives
Authentik-Konto an. Der Bestätigungslink per E-Mail ist 30 Minuten gültig und
aktiviert das Konto. Anschließend kann der Benutzer unter
`https://auth.example.org/zugang/` Zugriff auf Wanderer beantragen. Nach
Genehmigung erhält er die Gruppe `Wanderer App` und kann sich anmelden.

Wanderer verwendet den generischen OIDC-Anbieter von PocketBase. Der
konfigurierte Rücksprung ist:

```text
https://wanderer.example.org/login/redirect
```

Die Anwendung fordert die Bereiche `openid`, `profile` und `email` an. Die
Authentik-Anwendung und der OIDC-Anbieter heißen jeweils `Wanderer`; der
Anwendungs-Slug lautet `wanderer`. Client-ID und Client-Secret sind
Laufzeitgeheimnisse und gehören nicht in dieses Repository.

## Benutzer und Gruppen

Authentik verwaltet den Zugriff mit diesen Gruppen:

| Gruppe | Zweck | Mitglieder |
| --- | --- | --- |
| `Wanderer App` | Anmeldung an der Anwendung | Nach Genehmigung eines Zugriffsantrags |
| `Wanderer Admin` | Organisatorische Kennzeichnung für Administratoren | Zugewiesene Administratoren |

`Wanderer Admin` ist eine untergeordnete Gruppe von `Wanderer App`. Die
Admin-Gruppe gewährt keine PocketBase-Superuser-Rechte und ändert keine
fachlichen Berechtigungen innerhalb von Wanderer.

Das vorhandene PocketBase-Konto `instance-user` ist mit seiner stabilen
Authentik-OIDC-ID verbunden. Für neue Benutzer erzeugt PocketBase beim ersten
genehmigten OIDC-Login ein Wanderer-Konto.

## Persistente Konfiguration

Der Authentik-Provider, die Anwendung, die Registrierungs- und Anmeldeflows
sowie die Zugriffsbindung werden durch den Blueprint
`/path/to/deployment/config/authentik/wanderer.yaml` verwaltet. Der
Blueprint erlaubt die Anwendung nur für Mitglieder von `Wanderer App`.
Gruppenmitgliedschaften verwaltet die Zugriffsverwaltung nach Genehmigung.
Die Vorlagen der Bestätigungs-E-Mail liegen unter
`/path/to/deployment/config/authentik/email/` und sind im
Authentik-Template-Verzeichnis bereitgestellt.

`PUBLIC_DISABLE_SIGNUP=true` sperrt die lokale Registrierungsroute der
Webanwendung. Die Registrierung findet ausschließlich in Authentik statt.
