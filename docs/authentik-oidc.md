# OIDC authentication with Authentik

## Configure an instance

An instance can use Authentik as an OpenID Connect (OIDC) identity provider.
Configure the callback URL in the Authentik application as:

~~~text
https://your-domain.example/login/redirect
~~~

Replace the example host with the public host name configured for your
Wanderer instance. The application requests the `openid`, `profile`, and
`email` scopes. Confirm that the provider returns the claims required by your
PocketBase OIDC configuration.

Registration, email verification, access approval, and group membership are
controlled by the instance's Authentik configuration. Their exact flows and
labels can vary between deployments. If account registration should happen
only through the identity provider, disable local registration with
`PUBLIC_DISABLE_SIGNUP=true`.

PocketBase can create a Wanderer account on a user's first successful OIDC
sign-in. Review the provider and account settings for the behavior required by
your deployment. Keep the client ID and client secret in runtime secrets; do
not commit them to the repository.

## Access groups

Group names and membership policies are defined by the instance operator.
Use the identity provider to restrict access to the intended users. An
Authentik group membership alone does not grant PocketBase superuser rights or
change Wanderer's application-level authorization rules.

## Persistent configuration

Store Authentik blueprints, application settings, and email templates in the
deployment's managed configuration directory. For example, use a path such as
`<deployment-config-directory>/authentik/` rather than adding instance-specific
files to this repository.

Manage group membership and access approvals through the identity provider.
Treat configuration files that contain credentials or other secrets as
sensitive runtime data.

The `PUBLIC_DISABLE_SIGNUP` setting controls local registration in the web
application. It does not configure registration or access policies inside
Authentik.
