from django.contrib.auth import get_user_model
from django.test import override_settings
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse
from rest_framework.authtoken.models import Token
from rest_framework import status
from rest_framework.test import APITestCase
from finance.models import OAuthState, SocialIdentity
from finance.views import get_or_create_oauth_user, get_verified_oauth_profile


class FinanceAPITests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="finance-test-user",
            password="test-password",
        )
        self.client.force_authenticate(user=self.user)

    def test_transaction_is_saved_for_the_authenticated_user(self):
        response = self.client.post(
            "/api/transactions/",
            {
                "name": "Groceries",
                "category": "Food",
                "date": "2026-10-19",
                "amount": "125.50",
                "type": "expense",
                "icon": "",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["user"], self.user.username)
        self.assertEqual(str(response.data["amount"]), "125.50")
        self.assertEqual(self.user.transactions.count(), 1)

    def test_users_only_see_their_own_transactions(self):
        other_user = get_user_model().objects.create_user(
            username="another-finance-test-user",
            password="test-password",
        )
        self.user.transactions.create(
            name="My expense",
            category="Food",
            date="2026-10-19",
            amount="10.00",
            type="expense",
        )
        other_user.transactions.create(
            name="Someone else's expense",
            category="Food",
            date="2026-10-19",
            amount="20.00",
            type="expense",
        )

        response = self.client.get("/api/transactions/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item["name"] for item in response.data],
            ["My expense"],
        )

    def test_transactions_require_authentication(self):
        self.client.force_authenticate(user=None)

        response = self.client.get("/api/transactions/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_budget_is_saved_for_the_authenticated_user(self):
        response = self.client.post(
            "/api/budgets/",
            {"category": "Food", "month": "2026-10", "amount": "500.00"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["user"], self.user.username)
        self.assertEqual(self.user.budgets.count(), 1)

    def test_budget_rejects_an_invalid_month(self):
        response = self.client.post(
            "/api/budgets/",
            {"category": "Food", "month": "2026-13", "amount": "500.00"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("month", response.data)

    def test_budget_rejects_duplicate_category_and_month_ignoring_case(self):
        self.user.budgets.create(
            category="Food",
            month="2026-10",
            amount="500.00",
        )

        response = self.client.post(
            "/api/budgets/",
            {"category": "food", "month": "2026-10", "amount": "600.00"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.user.budgets.count(), 1)

    def test_budget_update_rejects_a_duplicate_category_and_month(self):
        budget = self.user.budgets.create(
            category="Food",
            month="2026-10",
            amount="500.00",
        )
        self.user.budgets.create(
            category="Transport",
            month="2026-10",
            amount="300.00",
        )

        response = self.client.patch(
            f"/api/budgets/{budget.id}/",
            {"category": "transport"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        budget.refresh_from_db()
        self.assertEqual(budget.category, "Food")

    def test_savings_goal_and_contribution_are_saved_for_the_user(self):
        goal_response = self.client.post(
            "/api/savings-goals/",
            {
                "name": "Emergency fund",
                "category": "Emergency fund",
                "target_amount": "1000.00",
                "deadline": None,
                "description": "For unexpected costs",
            },
            format="json",
        )

        self.assertEqual(goal_response.status_code, status.HTTP_201_CREATED)
        goal_id = goal_response.data["id"]

        contribution_response = self.client.post(
            "/api/savings-contributions/",
            {
                "goal": goal_id,
                "type": "deposit",
                "amount": "125.50",
                "date": "2026-10-19",
                "note": "First deposit",
            },
            format="json",
        )

        self.assertEqual(
            contribution_response.status_code,
            status.HTTP_201_CREATED,
        )
        self.assertEqual(contribution_response.data["goal"], goal_id)
        self.assertEqual(
            self.user.savings_goals.get(pk=goal_id).contributions.count(),
            1,
        )

    def test_user_cannot_add_contributions_to_another_users_goal(self):
        other_user = get_user_model().objects.create_user(
            username="another-savings-test-user",
            password="test-password",
        )
        goal = other_user.savings_goals.create(
            name="Private goal",
            target_amount="500.00",
        )

        response = self.client.post(
            "/api/savings-contributions/",
            {
                "goal": goal.id,
                "type": "deposit",
                "amount": "50.00",
                "date": "2026-10-19",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(goal.contributions.count(), 0)

    def test_withdrawal_cannot_exceed_the_goal_balance(self):
        goal = self.user.savings_goals.create(
            name="Travel fund",
            target_amount="500.00",
        )
        goal.contributions.create(
            type="deposit",
            amount="50.00",
            date="2026-10-19",
        )

        response = self.client.post(
            "/api/savings-contributions/",
            {
                "goal": goal.id,
                "type": "withdrawal",
                "amount": "75.00",
                "date": "2026-10-19",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(goal.contributions.count(), 1)


class AuthenticationAPITests(APITestCase):
    def test_social_link_start_requires_authentication(self):
        with override_settings(
            GOOGLE_CLIENT_ID="google-test-id",
            GOOGLE_CLIENT_SECRET="google-test-secret",
        ):
            response = self.client.post("/api/auth/google/link/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_signed_in_user_can_explicitly_link_google_identity(self):
        user = get_user_model().objects.create_user(
            username="ada", email="ada@example.com", password="LongPass!92xyz"
        )
        self.client.force_authenticate(user=user)
        with override_settings(
            GOOGLE_CLIENT_ID="google-test-id",
            GOOGLE_CLIENT_SECRET="google-test-secret",
            FRONTEND_PUBLIC_URL="http://localhost:5173",
            BACKEND_PUBLIC_URL="http://127.0.0.1:8000",
        ):
            start = self.client.post("/api/auth/google/link/")
            state = parse_qs(urlparse(start.data["authorization_url"]).query)["state"][0]
            with patch("finance.views.oauth_post", return_value={"access_token": "test-access"}), patch(
                "finance.views.get_verified_oauth_profile",
                return_value=("google-subject-1", "different@example.com", "Ada Lovelace"),
            ):
                callback = self.client.get(
                    "/api/auth/google/callback/",
                    {"state": state, "code": "test-code"},
                )

        self.assertIn("/auth/callback/#link_code=", callback["Location"])
        link_code = parse_qs(urlparse(callback["Location"]).fragment)["link_code"][0]
        other_user = get_user_model().objects.create_user(
            username="another", email="other@example.com", password="LongPass!92xyz"
        )
        self.client.force_authenticate(user=other_user)
        wrong_account = self.client.post(
            "/api/auth/google/link/complete/",
            {"code": link_code},
            format="json",
        )
        self.assertEqual(wrong_account.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=user)
        completed = self.client.post(
            "/api/auth/google/link/complete/",
            {"code": link_code},
            format="json",
        )
        self.assertEqual(completed.status_code, status.HTTP_200_OK)
        self.assertTrue(
            OAuthState.objects.filter(
                provider="google",
                purpose=OAuthState.LINK,
                user=user,
                consumed_at__isnull=False,
            ).exists()
        )
        self.assertTrue(
            SocialIdentity.objects.filter(
                user=user,
                provider="google",
                subject="google-subject-1",
            ).exists()
        )
        user_profile = self.client.get("/api/me/")
        self.assertIn("google", user_profile.data["social_providers"])
        replay = self.client.post(
            "/api/auth/google/link/complete/",
            {"code": link_code},
            format="json",
        )
        self.assertEqual(replay.status_code, status.HTTP_400_BAD_REQUEST)

    def test_google_profile_requires_verified_email_and_returns_subject(self):
        with patch(
            "finance.views.oauth_get",
            return_value={"sub": "google-subject", "email": "ada@example.com", "email_verified": True, "name": "Ada"},
        ):
            profile = get_verified_oauth_profile("google", "provider-token")
        self.assertEqual(profile, ("google-subject", "ada@example.com", "Ada"))

        with patch(
            "finance.views.oauth_get",
            return_value={"sub": "google-subject", "email": "ada@example.com", "email_verified": False},
        ):
            with self.assertRaises(ValueError):
                get_verified_oauth_profile("google", "provider-token")

    def test_github_profile_uses_verified_email_and_stable_id(self):
        with patch(
            "finance.views.oauth_get",
            side_effect=[
                {"id": 17, "login": "ada"},
                [{"email": "ada@example.com", "verified": True, "primary": True}],
            ],
        ):
            profile = get_verified_oauth_profile("github", "provider-token")
        self.assertEqual(profile, ("17", "ada@example.com", "ada"))

    def test_social_provider_list_reports_disabled_providers(self):
        with override_settings(
            GOOGLE_CLIENT_ID="",
            GOOGLE_CLIENT_SECRET="",
            GITHUB_CLIENT_ID="",
            GITHUB_CLIENT_SECRET="",
        ):
            response = self.client.get("/api/auth/providers/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"google": False, "github": False})

    def test_social_login_starts_and_completes_with_verified_account(self):
        with override_settings(
            GOOGLE_CLIENT_ID="google-test-id",
            GOOGLE_CLIENT_SECRET="google-test-secret",
            FRONTEND_PUBLIC_URL="http://localhost:5173",
            BACKEND_PUBLIC_URL="http://127.0.0.1:8000",
        ):
            start = self.client.get("/api/auth/google/")
            state = parse_qs(urlparse(start["Location"]).query)["state"][0]
            with patch("finance.views.oauth_post", return_value={"access_token": "test-access"}), patch(
                "finance.views.get_verified_oauth_profile",
                return_value=("google-subject-1", "ada@example.com", "Ada Lovelace"),
            ):
                callback = self.client.get(
                    "/api/auth/google/callback/",
                    {"state": state, "code": "test-code"},
                )

        self.assertEqual(callback.status_code, 302)
        self.assertIn("/auth/callback/#token=", callback["Location"])
        user = get_user_model().objects.get(email="ada@example.com")
        self.assertEqual(user.first_name, "Ada")
        self.assertTrue(Token.objects.filter(user=user).exists())
        self.assertTrue(
            SocialIdentity.objects.filter(
                user=user,
                provider="google",
                subject="google-subject-1",
            ).exists()
        )

    def test_social_login_does_not_auto_link_existing_password_account(self):
        existing_user = get_user_model().objects.create_user(
            username="ada", email="ada@example.com", password="LongPass!92xyz"
        )
        with override_settings(
            GOOGLE_CLIENT_ID="google-test-id",
            GOOGLE_CLIENT_SECRET="google-test-secret",
            FRONTEND_PUBLIC_URL="http://localhost:5173",
        ):
            start = self.client.get("/api/auth/google/")
            state = parse_qs(urlparse(start["Location"]).query)["state"][0]
            with patch("finance.views.oauth_post", return_value={"access_token": "test-access"}), patch(
                "finance.views.get_verified_oauth_profile",
                return_value=("google-subject-1", "ada@example.com", "Ada Lovelace"),
            ):
                callback = self.client.get(
                    "/api/auth/google/callback/",
                    {"state": state, "code": "test-code"},
                )

        self.assertIn("error=account_exists", callback["Location"])
        self.assertFalse(Token.objects.filter(user=existing_user).exists())
        self.assertFalse(SocialIdentity.objects.exists())

    def test_social_subject_reuses_account_when_provider_email_changes(self):
        original = get_or_create_oauth_user(
            "github", "github-id-17", "ada@example.com", "Ada Lovelace"
        )
        returned = get_or_create_oauth_user(
            "github", "github-id-17", "new-ada@example.com", "Ada Lovelace"
        )

        self.assertEqual(returned.pk, original.pk)
        self.assertEqual(get_user_model().objects.count(), 1)
        self.assertEqual(SocialIdentity.objects.count(), 1)

    def test_social_login_preserves_legacy_social_only_account(self):
        legacy_user = get_user_model().objects.create_user(
            username="github_ada",
            email="ada@example.com",
            password=None,
        )
        returned = get_or_create_oauth_user(
            "github", "github-id-17", "ada@example.com", "Ada Lovelace"
        )

        self.assertEqual(returned.pk, legacy_user.pk)
        self.assertFalse(legacy_user.has_usable_password())
        self.assertTrue(
            SocialIdentity.objects.filter(
                user=legacy_user,
                provider="github",
                subject="github-id-17",
            ).exists()
        )

    def test_social_callback_rejects_replayed_or_missing_state(self):
        response = self.client.get(
            "/api/auth/google/callback/",
            {"state": "forged", "code": "test-code"},
        )
        self.assertIn("error=invalid_state", response["Location"])

    def test_social_login_state_is_bound_to_starting_browser_session(self):
        with override_settings(
            GOOGLE_CLIENT_ID="google-test-id",
            GOOGLE_CLIENT_SECRET="google-test-secret",
            FRONTEND_PUBLIC_URL="http://localhost:5173",
        ):
            start = self.client.get("/api/auth/google/")
            state = parse_qs(urlparse(start["Location"]).query)["state"][0]
            other_client = self.client_class()
            forged_callback = other_client.get(
                "/api/auth/google/callback/",
                {"state": state, "code": "test-code"},
            )
            with patch("finance.views.oauth_post", return_value={"access_token": "test-access"}), patch(
                "finance.views.get_verified_oauth_profile",
                return_value=("google-subject", "ada@example.com", "Ada"),
            ):
                valid_callback = self.client.get(
                    "/api/auth/google/callback/",
                    {"state": state, "code": "test-code"},
                )

        self.assertIn("error=invalid_state", forged_callback["Location"])
        self.assertIn("/auth/callback/#token=", valid_callback["Location"])

    def test_registration_creates_user_with_hashed_password(self):
        response = self.client.post(
            "/api/register/",
            {"name": "Ada Lovelace", "email": "Ada@example.com", "password": "LongPass!92xyz"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = get_user_model().objects.get(email="ada@example.com")
        self.assertEqual(user.first_name, "Ada")
        self.assertEqual(user.last_name, "Lovelace")
        self.assertTrue(user.check_password("LongPass!92xyz"))

    def test_registration_rejects_duplicate_email_case_insensitively(self):
        get_user_model().objects.create_user(
            username="existing", email="ada@example.com", password="OldPass!92xyz"
        )
        response = self.client.post(
            "/api/register/",
            {"name": "Ada", "email": "ADA@example.com", "password": "LongPass!92xyz"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_accepts_email_and_me_returns_active_profile(self):
        user = get_user_model().objects.create_user(
            username="ada", email="ada@example.com", first_name="Ada", password="LongPass!92xyz"
        )
        response = self.client.post(
            "/api/token/",
            {"username": "ADA@example.com", "password": "LongPass!92xyz"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {response.data['token']}")
        profile = self.client.get("/api/me/")
        self.assertEqual(profile.status_code, status.HTTP_200_OK)
        self.assertEqual(profile.data["email"], user.email)
        self.assertEqual(profile.data["first_name"], "Ada")

    def test_logout_revokes_token(self):
        user = get_user_model().objects.create_user(username="ada", password="LongPass!92xyz")
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.post("/api/logout/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Token.objects.filter(pk=token.pk).exists())
