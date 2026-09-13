# Authentik-OIDC-Anmeldung

## Aktiver Anmeldeweg

Die produktive Instanz unter `https://wanderer.example.org` verwendet
Authentik unter `https://auth.example.org` als einzigen interaktiven
Anmeldeweg. Die lokale Passwortanmeldung und die lokale Registrierung sind
deaktiviert.

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
| `Wanderer App` | Anmeldung an der Anwendung | `verena` sowie Mitglieder der untergeordneten Admin-Gruppe |
| `Wanderer Admin` | Organisatorische Kennzeichnung für Administratoren | `instance-user` |

`Wanderer Admin` ist eine untergeordnete Gruppe von `Wanderer App`. Die
Admin-Gruppe gewährt keine PocketBase-Superuser-Rechte und ändert keine
fachlichen Berechtigungen innerhalb von Wanderer.

Das vorhandene PocketBase-Konto `instance-user` ist direkt mit der stabilen
Authentik-OIDC-ID von `instance-user` verbunden. Seine bestehenden Routen,
Gipfelbucheinträge und Einstellungen bleiben dadurch demselben Konto
zugeordnet. Für `verena` erzeugt PocketBase beim ersten erfolgreichen
OIDC-Login ein neues Wanderer-Konto.

## Persistente Konfiguration

Der Authentik-Provider, die Anwendung, die Zugriffsbindung und die
Gruppenmitgliedschaften werden durch den Blueprint
`/path/to/deployment/config/authentik/wanderer.yaml` verwaltet. Der
Blueprint erlaubt die Anwendung nur für Mitglieder von `Wanderer App`.

`PUBLIC_DISABLE_SIGNUP=true` sperrt die lokale Registrierungsroute der
Webanwendung. Neue Konten können weiterhin ausschließlich nach einer von
Authentik erlaubten OIDC-Anmeldung durch PocketBase angelegt werden.
