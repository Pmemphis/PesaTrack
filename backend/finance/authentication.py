from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.authtoken.models import Token


def issue_auth_token(user):
    """Return a valid token, replacing the user's token if it has expired."""
    token = Token.objects.filter(user=user).first()
    if token:
        expires_at = token.created + timedelta(days=settings.TOKEN_TTL_DAYS)
        if expires_at > timezone.now():
            return token
        token.delete()
    return Token.objects.create(user=user)


class ExpiringTokenAuthentication(TokenAuthentication):
    """DRF token authentication with a fixed lifetime from token creation."""

    def authenticate_credentials(self, key):
        model = self.get_model()
        try:
            token = model.objects.select_related("user").get(key=key)
        except model.DoesNotExist:
            raise AuthenticationFailed("Invalid token.")

        if not token.user.is_active:
            raise AuthenticationFailed("User inactive or deleted.")

        expires_at = token.created + timedelta(days=settings.TOKEN_TTL_DAYS)
        if expires_at <= timezone.now():
            token.delete()
            raise AuthenticationFailed("Token expired. Please sign in again.")

        return (token.user, token)
