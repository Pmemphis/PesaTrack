param(
    [string]$ProjectId = "pesatrack-22172",
    [string]$Region = "europe-west1"
)

$ErrorActionPreference = "Stop"
$Repository = "pesatrack"
$Service = "pesatrack-staging-api"
$MigrationJob = "pesatrack-staging-migrate"
$RuntimeAccount = "pesatrack-cloudrun-runtime"
$SecretKeyName = "pesatrack-staging-django-secret"
$DatabaseSecretName = "pesatrack-staging-database-url"
$OAuthSecrets = @(
    @{ Environment = "GOOGLE_CLIENT_ID"; Name = "pesatrack-staging-google-id" },
    @{ Environment = "GOOGLE_CLIENT_SECRET"; Name = "pesatrack-staging-google-secret" },
    @{ Environment = "GITHUB_CLIENT_ID"; Name = "pesatrack-staging-github-id" },
    @{ Environment = "GITHUB_CLIENT_SECRET"; Name = "pesatrack-staging-github-secret" }
)
$Image = "$Region-docker.pkg.dev/$ProjectId/$Repository/$Service`:latest"
$EnvironmentFile = Join-Path $PSScriptRoot "cloudrun.staging.env.yaml"

function Invoke-Gcloud {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    & gcloud @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "gcloud command failed: gcloud $($Arguments -join ' ')"
    }
}

Push-Location $PSScriptRoot
try {
    Invoke-Gcloud @("config", "set", "project", $ProjectId)
    Invoke-Gcloud @("services", "enable", "run.googleapis.com", "cloudbuild.googleapis.com", "artifactregistry.googleapis.com", "secretmanager.googleapis.com", "--project", $ProjectId)

    & gcloud artifacts repositories describe $Repository --location $Region --project $ProjectId *> $null
    if ($LASTEXITCODE -ne 0) {
        Invoke-Gcloud @("artifacts", "repositories", "create", $Repository, "--repository-format=docker", "--location", $Region, "--project", $ProjectId)
    }

    $AccountEmail = "$RuntimeAccount@$ProjectId.iam.gserviceaccount.com"
    & gcloud iam service-accounts describe $AccountEmail --project $ProjectId *> $null
    if ($LASTEXITCODE -ne 0) {
        Invoke-Gcloud @("iam", "service-accounts", "create", $RuntimeAccount, "--display-name=PesaTrack Cloud Run staging", "--project", $ProjectId)
    }

    foreach ($SecretName in @($SecretKeyName, $DatabaseSecretName)) {
        Invoke-Gcloud @("secrets", "add-iam-policy-binding", $SecretName, "--member=serviceAccount:$AccountEmail", "--role=roles/secretmanager.secretAccessor", "--project", $ProjectId)
    }

    $ServiceSecrets = @(
        "SECRET_KEY=$SecretKeyName`:latest",
        "DATABASE_URL=$DatabaseSecretName`:latest"
    )
    foreach ($OAuthSecret in $OAuthSecrets) {
        & gcloud secrets describe $OAuthSecret.Name --project $ProjectId *> $null
        if ($LASTEXITCODE -eq 0) {
            Invoke-Gcloud @("secrets", "add-iam-policy-binding", $OAuthSecret.Name, "--member=serviceAccount:$AccountEmail", "--role=roles/secretmanager.secretAccessor", "--project", $ProjectId)
            $ServiceSecrets += "$($OAuthSecret.Environment)=$($OAuthSecret.Name)`:latest"
        }
    }
    $ServiceSecretArgument = "--set-secrets=$($ServiceSecrets -join ',')"

    Invoke-Gcloud @("builds", "submit", "--tag", $Image, "--project", $ProjectId, ".")

    Invoke-Gcloud @("run", "jobs", "deploy", $MigrationJob, "--image", $Image, "--region", $Region, "--service-account", $AccountEmail, "--task-timeout=600", "--max-retries=0", "--command=python", "--args=manage.py,migrate", "--env-vars-file", $EnvironmentFile, "--set-secrets=SECRET_KEY=$SecretKeyName`:latest,DATABASE_URL=$DatabaseSecretName`:latest", "--project", $ProjectId)
    Invoke-Gcloud @("run", "jobs", "execute", $MigrationJob, "--region", $Region, "--wait", "--project", $ProjectId)

    Invoke-Gcloud @("run", "jobs", "update", $MigrationJob, "--region", $Region, "--command=python", "--args=manage.py,createcachetable", "--project", $ProjectId)
    Invoke-Gcloud @("run", "jobs", "execute", $MigrationJob, "--region", $Region, "--wait", "--project", $ProjectId)

    Invoke-Gcloud @("run", "deploy", $Service, "--image", $Image, "--region", $Region, "--service-account", $AccountEmail, "--allow-unauthenticated", "--min=0", "--max=3", "--cpu=1", "--memory=1Gi", "--concurrency=20", "--timeout=60", "--env-vars-file", $EnvironmentFile, $ServiceSecretArgument, "--project", $ProjectId)
}
finally {
    Pop-Location
}
