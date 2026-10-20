# No-cost staging deployment

This setup keeps the React frontend on Firebase Hosting's no-cost Spark tier,
runs the Django API on Render's free web-service tier, and stores relational
data in a Neon Free PostgreSQL database. The Django backend remains in place;
Firebase Auth and Firestore are not replacements for its existing auth and
PostgreSQL data model.

## Free-tier tradeoffs

- Render's free web service sleeps after 15 minutes without traffic and can
  take about a minute to wake. Free services can restart and have no persistent
  disk. Render's free Postgres expires after 30 days, so this configuration
  deliberately uses Neon for the database instead. [Render free service
  limits](https://render.com/docs/free)
- Neon currently lists 100 compute hours and 1 GB storage per project on its
  free plan. Idle databases suspend; free usage can be exhausted. Use this for
  learning and staging, not as the only copy of important production finances.
  [Neon free plan](https://neon.com/blog/neon-free-plan-1-gb-per-project)
- Keep a payment method off the Render workspace to avoid accidental charges.
  Render says a free workspace without a payment method is suspended if usage
  would otherwise incur charges. [Render billing FAQ](https://render.com/docs/faq)

## One-time setup

1. In the Neon project you created in Singapore, create a child branch named
   `staging` from the `production` branch. This keeps staging records separate.
   Open **Connect**, select the `staging` branch, and copy the **pooled** Postgres
   connection URL. Keep `sslmode=require` in the URL. Do not put the database
   URL into this repository or chat. The Render API is configured for Singapore
   too, keeping database requests in the same region.
2. In Render, connect the GitHub repository `Pmemphis/PesaTrack` and create a
   Blueprint from the repository's root `render.yaml`. Choose the Free plan.
   Render will prompt for `SECRET_KEY` and `DATABASE_URL` because the Blueprint
   marks them as private values. Generate a random Django key with at least 50
   characters; for example, run `python -c "import secrets; print(secrets.token_urlsafe(48))"`
   locally and paste the result only into Render. Paste Neon's pooled URL into
   `DATABASE_URL`.
3. The Blueprint deploys the API at
   `https://pesatrack-staging-api.onrender.com`. It runs Django migrations and
   creates the shared request-throttle cache table before starting Gunicorn.
   The free service is limited to one instance, so this startup migration is
   serialized for this staging setup.
4. Build and deploy the React app to the existing Firebase site:

   ```powershell
   Set-Location frontend
   npm run build:staging
   firebase deploy --only hosting --project pesatrack-22172
   ```

   The frontend calls the Render API directly. The API allows the Firebase site
   in its CORS settings; OAuth redirects use the Render API callback paths.

## OAuth setup

Create staging Google and GitHub OAuth apps and register the callback URLs from
`backend/OAUTH_SETUP.md`. Add their client IDs and secrets in the Render
service's environment settings as `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET`. The provider buttons remain
unavailable until those values are set.

## Verify staging

Open `https://pesatrack-staging-api.onrender.com/api/health/` and confirm the
health check succeeds. Then register and sign in with email, test configured
OAuth providers, check the Render deployment logs for completed migrations,
and open `/transactions`, `/budgets`, and `/savings` directly on the Firebase
site. The free backend's first request after it sleeps will be slow while it
starts; account for that when checking sign-in.
