# Google and GitHub sign-in setup

PesaTrack can run its email/password registration and sign-in without OAuth
credentials. The Google and GitHub buttons become active after each provider's
client ID and secret are added to `backend/.env` and Django is restarted.

## Local callback URLs

Register these exact callback URLs in each provider's OAuth application:

- Google: `http://127.0.0.1:8000/api/auth/google/callback/`
- GitHub: `http://127.0.0.1:8000/api/auth/github/callback/`

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, and
`GITHUB_CLIENT_SECRET` in `backend/.env`. The example variable names and local
frontend/backend URLs are in `.env.example`. Keep the real secrets private and
do not commit `.env`.

The frontend reads its public backend address from `frontend/.env` using
`VITE_API_BASE_URL`. For local development, copy `frontend/.env.example` or use
the built-in `http://127.0.0.1:8000` default, then restart Vite after changing
the value.

For deployment, set `BACKEND_PUBLIC_URL` and `FRONTEND_PUBLIC_URL` to the
deployed HTTPS origins and register each matching HTTPS callback URL with its
provider. Provider callback URLs must match exactly.

For a public deployment, set `DJANGO_DEBUG=False`, a generated private
`SECRET_KEY`, and the deployed host in `ALLOWED_HOSTS`. Set the frontend HTTPS
origin in both `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS`. Django then
enforces HTTPS redirects and secure session/CSRF cookies. Configure your HTTPS
reverse proxy to forward the original request scheme. Do not use the example
secret placeholder as a real key.

If TLS terminates at a reverse proxy, set `TRUST_X_FORWARDED_PROTO=True` only
when that proxy overwrites `X-Forwarded-Proto` and does not pass through a
client-supplied value. For direct HTTPS hosting, leave it unset.

The backend verifies provider emails, but identifies returning OAuth accounts
using Google's stable subject ID or GitHub's numeric account ID. It never
silently links a password account based on email alone. To connect a provider
to an existing account, sign in to PesaTrack and use the explicit link action
in Account settings.

## Staging deployment

The repository includes `fly.staging.toml`, a backend Dockerfile and Firebase
Hosting configuration for the staging hostnames `pesatrack-staging-pmemphis`.
Create the Firebase Hosting site in a Firebase project you control, then select
that project when deploying. Create the Fly app and Managed Postgres cluster
in your Fly.io account (Managed Postgres is a billed resource). Attach the
database so Fly provides `DATABASE_URL`. Set `SECRET_KEY` and OAuth credentials
as Fly secrets; do not put them in either checked-in TOML file. Use separate
staging OAuth applications so local callback settings remain intact. Configure
the staging GitHub OAuth app with this callback URL and add both staging
callbacks to the Google OAuth client after the staging API exists:

- Google: `https://pesatrack-staging-pmemphis.fly.dev/api/auth/google/callback/`
- GitHub: `https://pesatrack-staging-pmemphis.fly.dev/api/auth/github/callback/`

Build the frontend from `frontend/` with `npm run build:staging`; its checked-in
`.env.staging` points to the staging API. Deploy that build to the configured
Firebase site. Deploy the backend from `backend/` with
`fly deploy --config fly.staging.toml`. Fly runs database migrations and
creates the shared throttle cache table before each release. The API token
lifetime defaults to 30 days. Authentication routes also use scoped request
throttles; those are basic abuse controls, not a replacement for a managed
edge firewall or monitoring.
