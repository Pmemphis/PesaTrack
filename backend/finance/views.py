
import json
import hashlib
import secrets
from datetime import timedelta
from decimal import Decimal
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.db import IntegrityError, connection, transaction
from django.db.models import Q, Sum
from django.utils import timezone
from django.contrib.auth import authenticate, get_user_model
from rest_framework import status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import ScopedRateThrottle
from django.http import HttpResponseRedirect
from rest_framework.exceptions import ValidationError

from .models import (
    Transaction,
    Budget,
    SavingsGoal,
    SavingsContribution,
    SocialIdentity,
    OAuthState,
)
from .authentication import issue_auth_token
from .serializers import (
    TransactionSerializer,
    BudgetSerializer,
    SavingsGoalSerializer,
    SavingsContributionSerializer,
    RegistrationSerializer,
    UserProfileSerializer,
)


User = get_user_model()


class HealthCheckView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = []

    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return Response({"status": "ok"})


class RegistrationView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "registration"

    def post(self, request):
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            UserProfileSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        identifier = str(request.data.get("username", "")).strip()
        password = request.data.get("password", "")
        username = identifier

        if "@" in identifier:
            user = User.objects.filter(email__iexact=identifier).first()
            username = user.username if user else ""

        user = authenticate(request, username=username, password=password)
        if not user:
            return Response(
                {"detail": "Invalid email/username or password."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token = issue_auth_token(user)
        return Response({"token": token.key})


class LogoutView(APIView):
    def post(self, request):
        if request.auth:
            request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CurrentUserView(APIView):
    def get(self, request):
        return Response(UserProfileSerializer(request.user).data)


OAUTH_PROVIDERS = {
    "google": {
        "client_id_setting": "GOOGLE_CLIENT_ID",
        "client_secret_setting": "GOOGLE_CLIENT_SECRET",
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
    },
    "github": {
        "client_id_setting": "GITHUB_CLIENT_ID",
        "client_secret_setting": "GITHUB_CLIENT_SECRET",
        "authorize_url": "https://github.com/login/oauth/authorize",
        "token_url": "https://github.com/login/oauth/access_token",
    },
}


class OAuthAccountConflict(Exception):
    """A verified social email belongs to an existing password account."""


def create_oauth_state(provider, purpose=OAuthState.LOGIN, user=None):
    now = timezone.now()
    OAuthState.objects.filter(
        Q(expires_at__lt=now)
        | Q(purpose=OAuthState.LOGIN, consumed_at__isnull=False)
        | Q(purpose=OAuthState.LINK, completed_at__isnull=False)
    ).delete()

    raw_state = secrets.token_urlsafe(32)
    OAuthState.objects.create(
        provider=provider,
        state_hash=hashlib.sha256(raw_state.encode("utf-8")).hexdigest(),
        purpose=purpose,
        user=user,
        expires_at=now + timedelta(minutes=10),
    )
    return raw_state


@transaction.atomic
def consume_oauth_state(provider, raw_state, session_state=""):
    state_hash = hashlib.sha256(raw_state.encode("utf-8")).hexdigest()
    state_record = OAuthState.objects.select_for_update().filter(
        provider=provider,
        state_hash=state_hash,
    ).first()
    if (
        not state_record
        or state_record.consumed_at is not None
        or state_record.expires_at <= timezone.now()
    ):
        return None
    if state_record.purpose == OAuthState.LOGIN and (
        not session_state or not secrets.compare_digest(raw_state, session_state)
    ):
        return None
    if state_record.purpose == OAuthState.LINK and not state_record.user_id:
        return None

    state_record.consumed_at = timezone.now()
    state_record.save(update_fields=["consumed_at"])
    return state_record


def build_oauth_authorization_url(provider, state):
    config = OAUTH_PROVIDERS[provider]
    query = {
        "client_id": getattr(settings, config["client_id_setting"]),
        "redirect_uri": oauth_callback_url(provider),
        "state": state,
    }
    if provider == "google":
        query.update({"response_type": "code", "scope": "openid email profile"})
    else:
        query["scope"] = "read:user user:email"
    return f"{config['authorize_url']}?{urlencode(query)}"


def oauth_callback_url(provider):
    return f"{settings.BACKEND_PUBLIC_URL.rstrip('/')}/api/auth/{provider}/callback/"


def oauth_is_configured(provider):
    config = OAUTH_PROVIDERS[provider]
    return bool(
        getattr(settings, config["client_id_setting"], "")
        and getattr(settings, config["client_secret_setting"], "")
    )


class OAuthProvidersView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({provider: oauth_is_configured(provider) for provider in OAUTH_PROVIDERS})


class OAuthStartView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "oauth"

    def get(self, request, provider):
        config = OAUTH_PROVIDERS[provider]
        if not oauth_is_configured(provider):
            return Response(
                {"detail": f"{provider.title()} sign-in is not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        state = create_oauth_state(provider)
        request.session[f"pesatrack_oauth_state_{provider}"] = state
        return HttpResponseRedirect(build_oauth_authorization_url(provider, state))


class OAuthLinkStartView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "oauth"

    def post(self, request, provider):
        if not oauth_is_configured(provider):
            return Response(
                {"detail": f"{provider.title()} sign-in is not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        state = create_oauth_state(provider, purpose=OAuthState.LINK, user=request.user)
        return Response({"authorization_url": build_oauth_authorization_url(provider, state)})


class OAuthLinkCompleteView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, provider):
        code = request.data.get("code", "")
        if not isinstance(code, str) or not code:
            return Response({"detail": "A link code is required."}, status=status.HTTP_400_BAD_REQUEST)

        code_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()
        state_record = OAuthState.objects.select_for_update().filter(
            provider=provider,
            purpose=OAuthState.LINK,
            completion_hash=code_hash,
        ).first()
        if (
            not state_record
            or state_record.completed_at is not None
            or not state_record.completion_expires_at
            or state_record.completion_expires_at <= timezone.now()
        ):
            return Response({"detail": "This link request has expired. Start again."}, status=status.HTTP_400_BAD_REQUEST)
        if state_record.user_id != request.user.pk:
            return Response({"detail": "Sign in to the PesaTrack account that started this link."}, status=status.HTTP_403_FORBIDDEN)

        try:
            link_social_identity(
                request.user,
                provider,
                state_record.provider_subject,
            )
        except OAuthAccountConflict:
            return Response(
                {"detail": "This provider account is already linked to another PesaTrack account."},
                status=status.HTTP_409_CONFLICT,
            )

        state_record.completed_at = timezone.now()
        state_record.save(update_fields=["completed_at"])
        return Response(UserProfileSerializer(request.user).data)


def oauth_post(url, data, headers=None):
    request = Request(
        url,
        data=urlencode(data).encode("utf-8"),
        headers={"Accept": "application/json", **(headers or {})},
        method="POST",
    )
    with urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def oauth_get(url, access_token, headers=None):
    request = Request(
        url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "User-Agent": "PesaTrack",
            **(headers or {}),
        },
    )
    with urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def get_verified_oauth_profile(provider, access_token):
    if provider == "google":
        profile = oauth_get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            access_token,
        )
        if not profile.get("email_verified"):
            raise ValueError("Google did not return a verified email address.")
        subject = profile.get("sub")
        if not subject:
            raise ValueError("Google did not return a stable account ID.")
        return str(subject), profile["email"], profile.get("name", "")

    profile = oauth_get("https://api.github.com/user", access_token)
    emails = oauth_get("https://api.github.com/user/emails", access_token)
    verified_email = next(
        (item["email"] for item in emails if item.get("verified") and item.get("primary")),
        None,
    )
    if not verified_email:
        verified_email = next(
            (item["email"] for item in emails if item.get("verified")),
            None,
        )
    if not verified_email:
        raise ValueError("GitHub did not return a verified email address.")
    subject = profile.get("id")
    if subject is None:
        raise ValueError("GitHub did not return a stable account ID.")
    return str(subject), verified_email, profile.get("name") or profile.get("login", "")


def get_or_create_oauth_user(provider, subject, email, name):
    identity = SocialIdentity.objects.select_related("user").filter(
        provider=provider,
        subject=subject,
    ).first()
    if identity:
        return identity.user

    existing_user = User.objects.filter(email__iexact=email).first()
    if existing_user:
        # Older OAuth accounts were created with unusable passwords. Preserve
        # access for those accounts, but never attach a provider to a password
        # account just because the email strings match.
        if existing_user.has_usable_password():
            raise OAuthAccountConflict
        try:
            with transaction.atomic():
                SocialIdentity.objects.create(
                    user=existing_user,
                    provider=provider,
                    subject=subject,
                )
        except IntegrityError:
            identity = SocialIdentity.objects.select_related("user").filter(
                provider=provider,
                subject=subject,
            ).first()
            if identity:
                return identity.user
            raise
        return existing_user

    name_parts = name.split(maxsplit=1)
    first_name = name_parts[0] if name_parts else ""
    last_name = name_parts[1] if len(name_parts) > 1 else ""
    base = f"{provider}_{email.split('@', maxsplit=1)[0]}"[:150]
    username = base
    suffix = 1
    while User.objects.filter(username__iexact=username).exists():
        suffix_text = str(suffix)
        username = f"{base[:150 - len(suffix_text)]}{suffix_text}"
        suffix += 1
    try:
        with transaction.atomic():
            user = User.objects.create_user(
                username=username,
                email=email.lower(),
                first_name=first_name,
                last_name=last_name,
            )
            SocialIdentity.objects.create(
                user=user,
                provider=provider,
                subject=subject,
            )
            return user
    except IntegrityError:
        # A concurrent callback may have created this provider identity first.
        identity = SocialIdentity.objects.select_related("user").filter(
            provider=provider,
            subject=subject,
        ).first()
        if identity:
            return identity.user
        raise


def link_social_identity(user, provider, subject):
    identity = SocialIdentity.objects.filter(provider=provider, subject=subject).first()
    if identity:
        if identity.user_id == user.pk:
            return
        raise OAuthAccountConflict

    if SocialIdentity.objects.filter(user=user, provider=provider).exists():
        raise OAuthAccountConflict

    try:
        with transaction.atomic():
            SocialIdentity.objects.create(user=user, provider=provider, subject=subject)
    except IntegrityError:
        identity = SocialIdentity.objects.filter(provider=provider, subject=subject).first()
        if identity and identity.user_id == user.pk:
            return
        raise OAuthAccountConflict


class OAuthCallbackView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "oauth"

    def get(self, request, provider):
        frontend = settings.FRONTEND_PUBLIC_URL.rstrip("/")
        state = request.query_params.get("state", "")
        session_state = request.session.pop(f"pesatrack_oauth_state_{provider}", "")
        state_record = consume_oauth_state(provider, state, session_state) if state else None
        if not state_record:
            return HttpResponseRedirect(f"{frontend}/auth/callback/#error=invalid_state")

        if request.query_params.get("error"):
            return HttpResponseRedirect(f"{frontend}/auth/callback/#error=provider_denied")

        try:
            code = request.query_params["code"]
            config = OAUTH_PROVIDERS[provider]
            token_data = oauth_post(
                config["token_url"],
                {
                    "client_id": getattr(settings, config["client_id_setting"]),
                    "client_secret": getattr(settings, config["client_secret_setting"]),
                    "code": code,
                    "redirect_uri": oauth_callback_url(provider),
                    "grant_type": "authorization_code",
                },
            )
            access_token = token_data.get("access_token")
            if not access_token:
                raise ValueError("The provider did not return an access token.")
            subject, email, name = get_verified_oauth_profile(provider, access_token)
            if state_record.purpose == OAuthState.LINK:
                completion_code = secrets.token_urlsafe(32)
                state_record.provider_subject = subject
                state_record.completion_hash = hashlib.sha256(
                    completion_code.encode("utf-8")
                ).hexdigest()
                state_record.completion_expires_at = timezone.now() + timedelta(minutes=5)
                state_record.save(
                    update_fields=[
                        "provider_subject",
                        "completion_hash",
                        "completion_expires_at",
                    ]
                )
                return HttpResponseRedirect(
                    f"{frontend}/auth/callback/#link_code={completion_code}&provider={provider}"
                )

            user = get_or_create_oauth_user(provider, subject, email, name)
            token = issue_auth_token(user)
            return HttpResponseRedirect(f"{frontend}/auth/callback/#token={token.key}")
        except OAuthAccountConflict:
            error = "identity_conflict" if state_record.purpose == OAuthState.LINK else "account_exists"
            return HttpResponseRedirect(f"{frontend}/auth/callback/#error={error}")
        except (KeyError, ValueError, HTTPError, URLError, TimeoutError, json.JSONDecodeError):
            return HttpResponseRedirect(f"{frontend}/auth/callback/#error=sign_in_failed")


class TransactionViewSet(viewsets.ModelViewSet):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Transaction.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class BudgetViewSet(viewsets.ModelViewSet):
    serializer_class = BudgetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Budget.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class SavingsGoalViewSet(viewsets.ModelViewSet):
    serializer_class = SavingsGoalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return SavingsGoal.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class SavingsContributionViewSet(viewsets.ModelViewSet):
    serializer_class = SavingsContributionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return SavingsContribution.objects.filter(
            goal__user=self.request.user
        )

    @transaction.atomic
    def perform_create(self, serializer):
        goal_id = self.request.data.get("goal")

        if not goal_id:
            raise ValidationError(
                {"goal": "A savings goal is required."}
            )

        try:
            goal = SavingsGoal.objects.select_for_update().get(
                pk=goal_id,
                user=self.request.user,
            )
        except SavingsGoal.DoesNotExist:
            raise ValidationError(
                {"goal": "The requested savings goal was not found."}
            )

        if serializer.validated_data["type"] == SavingsContribution.WITHDRAWAL:
            totals = goal.contributions.aggregate(
                deposits=Sum("amount", filter=Q(type=SavingsContribution.DEPOSIT)),
                withdrawals=Sum(
                    "amount",
                    filter=Q(type=SavingsContribution.WITHDRAWAL),
                ),
            )
            balance = (totals["deposits"] or Decimal("0")) - (
                totals["withdrawals"] or Decimal("0")
            )

            if serializer.validated_data["amount"] > balance:
                raise ValidationError(
                    {"amount": "A withdrawal cannot exceed the available goal balance."}
                )

        serializer.save(goal=goal)
