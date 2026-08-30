---
title: Backend configuration
description: How to access the PocketBase backend
---

For many configuration options, it is necessary that you are able to access the PocketBase backend. 
PocketBase comes with a handy dashboard that allows you to configure basically everything in the backend.

The default Docker configuration keeps PocketBase port `8090` on the internal
Docker network. Do not publish this port on a public interface. For temporary
local dashboard access, add a local Compose override that binds the port only
to the loopback interface:

```yaml
services:
  db:
    ports:
      - "127.0.0.1:8090:8090"
```

Apply the override only while it is needed. The PocketBase admin panel is then
available at `http://localhost:8090/_/`. For a remote server, use an SSH tunnel
to the loopback-bound port.

If this is your first time visiting the panel you will need to create an admin account.
To create backend access navigate to the location of your `docker-compose.yaml` file on the server and type:

```sh
docker compose exec -it db /pocketbase superuser upsert email@example.com myverysecurepassword
```

Via the online dashboard, you will now have access with the user "email@example.com" and the password "myverysecurepassword" to all tables in the backend and can modify the underlying data directly.

For specific configuration guides see:

- [SMTP settings](./smtp/)
- [Auth providers](./auth-providers/)
- [Backup server](./backup-server/)
- [Custom categories](./custom-categories/)
- [Adjust Filesize Limits](./adjust-filesize-limits/)

To learn more about what you can do in the admin dashboard please refer to PocketBase's [documentation](https://pocketbase.io/docs/).
