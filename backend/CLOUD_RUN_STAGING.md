# Cloud Run staging deployment

This staging setup serves the React app from Firebase Hosting and routes `/api/**`
to the Django container on Cloud Run. The browser uses the Firebase site as one
origin, including for API calls and OAuth callbacks. The database remains
PostgreSQL; Firestore is not a drop-in replacement for this Django ORM app.

## Cost and services

- Firebase Hosting uses its no-cost allowance for small sites. Cloud Run has a
  monthly free usage allowance, but Google requires a billing account and usage
  beyond the allowance is billed. Create a Google Cloud budget alert before
  enabling billing; an alert notifies you but does not stop charges.
- For staging, Neon Free is the proposed PostgreSQL host. Neon currently lists
  100 compute hours and 1 GB of storage per project on its free plan. It can
  suspend compute after inactivity, so the first database request may be slower.
  Keep production financial data on a paid database plan with backups and a
  recovery plan.
- Choose a Neon region in Europe (Frankfurt is a reasonable staging location
  near Cloud Run `europe-west1`). Use Neon's pooled PostgreSQL connection URL
  and retain `sslmode=require` in the URL.

## One-time account setup

1. In the Firebase/Google Cloud console, confirm project `pesatrack-22172` is
   accessible, link a billing account, and create a budget alert. Linking billing
   changes a Spark Firebase project to Blaze. Cloud Run is not available on
   Spark alone. Enable Firebase Hosting and confirm its default site ID is
   `pesatrack-22172` (the corresponding URL is
   `https://pesatrack-22172.web.app`).
2. Create a Neon staging project and database. Copy its pooled PostgreSQL URL.
   Do not commit the URL or paste it into chat.
3. In Google Cloud Secret Manager, create these secrets and add a version to
   each: `pesatrack-staging-django-secret` (a private Django key at least 50
   characters long) and `pesatrack-staging-database-url` (the Neon URL).
4. Install and sign in to the Google Cloud CLI with an account that can enable
   APIs, build and deploy containers, manage secrets/IAM, and deploy Cloud Run
   services and jobs. Confirm `gcloud config get project` returns
   `pesatrack-22172`.

The deploy script creates an Artifact Registry repository and a dedicated
Cloud Run runtime service account, then grants that service account access only
to the two staging secrets. It builds the backend image, runs migrations and
creates the shared database cache table in one-off Cloud Run jobs, then deploys
the API with scale-to-zero and a maximum of three instances.

The staging config sets `NUM_PROXIES=3` based on Google's documented forwarded
header example (`clientIp, proxy1Ip, proxy2Ip`), so DRF throttles can use the
client address after the Hosting/Cloud Run proxy chain. Confirm this against
the live request headers during staging verification before relying on
IP-based throttling.

## Deploy the backend

From PowerShell at the repository root, run:

```powershell
./backend/deploy-staging.ps1
```

This command incurs Cloud Build/Artifact Registry/Cloud Run charges if usage is
outside the applicable free quotas. Review the billing alert and usage after
deployment.

## Deploy the frontend and route configuration

After the backend service exists, build and publish the React app:

```powershell
Set-Location frontend
npm run build:staging
firebase deploy --only hosting --project pesatrack-22172
```

`firebase.json` routes `/api/**` to `pesatrack-staging-api` in `europe-west1`
before sending other unknown paths to `index.html`. That order keeps API calls
and direct navigation to React routes working. Hosting's Cloud Run rewrite needs
the service to exist before the Hosting configuration is deployed.

## OAuth setup

Create separate staging OAuth clients. Set their redirect URIs to:

- Google: `https://pesatrack-22172.web.app/api/auth/google/callback/`
- GitHub: `https://pesatrack-22172.web.app/api/auth/github/callback/`

Store each OAuth client ID and secret in Secret Manager, then bind them to the
Cloud Run service as `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET`. Do not put credentials in this
repository. The sign-in buttons remain unavailable until these credentials are
configured. Use these Secret Manager names and add a version to each. Rerun
`deploy-staging.ps1` after all four secrets have versions; the script detects
them, grants the runtime service account access, and binds them to Cloud Run.

| Environment variable | Secret name |
| --- | --- |
| `GOOGLE_CLIENT_ID` | `pesatrack-staging-google-id` |
| `GOOGLE_CLIENT_SECRET` | `pesatrack-staging-google-secret` |
| `GITHUB_CLIENT_ID` | `pesatrack-staging-github-id` |
| `GITHUB_CLIENT_SECRET` | `pesatrack-staging-github-secret` |

## Staging checks

After deploying, check `/api/health/`, create and sign in with an email account,
test each configured OAuth callback, inspect Cloud Run job logs to confirm
migrations completed, and open `/transactions`, `/budgets`, and `/savings`
directly in a fresh browser tab. These live checks require the cloud accounts,
database secret, and OAuth clients above.
