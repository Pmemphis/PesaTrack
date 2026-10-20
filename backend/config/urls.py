
from django.contrib import admin
from django.urls import path, include
from finance.views import (
    CurrentUserView,
    LoginView,
    LogoutView,
    RegistrationView,
    OAuthProvidersView,
    OAuthStartView,
    OAuthLinkStartView,
    OAuthLinkCompleteView,
    OAuthCallbackView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/token/", LoginView.as_view(), name="api-token"),
    path("api/register/", RegistrationView.as_view(), name="api-register"),
    path("api/logout/", LogoutView.as_view(), name="api-logout"),
    path("api/me/", CurrentUserView.as_view(), name="api-me"),
    path("api/auth/providers/", OAuthProvidersView.as_view(), name="oauth-providers"),
    path("api/auth/google/", OAuthStartView.as_view(), {"provider": "google"}, name="google-login"),
    path("api/auth/github/", OAuthStartView.as_view(), {"provider": "github"}, name="github-login"),
    path("api/auth/google/link/", OAuthLinkStartView.as_view(), {"provider": "google"}, name="google-link"),
    path("api/auth/github/link/", OAuthLinkStartView.as_view(), {"provider": "github"}, name="github-link"),
    path("api/auth/google/link/complete/", OAuthLinkCompleteView.as_view(), {"provider": "google"}, name="google-link-complete"),
    path("api/auth/github/link/complete/", OAuthLinkCompleteView.as_view(), {"provider": "github"}, name="github-link-complete"),
    path("api/auth/google/callback/", OAuthCallbackView.as_view(), {"provider": "google"}, name="google-callback"),
    path("api/auth/github/callback/", OAuthCallbackView.as_view(), {"provider": "github"}, name="github-callback"),
    path("api/", include("finance.urls")),
    path("api-auth/", include("rest_framework.urls")),
]
