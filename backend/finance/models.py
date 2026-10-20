
from django.conf import settings
from django.db import models
from django.core.validators import MinValueValidator
from decimal import Decimal


class SocialIdentity(models.Model):
    GOOGLE = "google"
    GITHUB = "github"
    PROVIDER_CHOICES = [
        (GOOGLE, "Google"),
        (GITHUB, "GitHub"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="social_identities",
    )
    provider = models.CharField(max_length=16, choices=PROVIDER_CHOICES)
    subject = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "subject"],
                name="unique_social_provider_subject",
            ),
            models.UniqueConstraint(
                fields=["user", "provider"],
                name="unique_social_user_provider",
            ),
        ]

    def __str__(self):
        return f"{self.provider} identity for {self.user_id}"


class OAuthState(models.Model):
    LOGIN = "login"
    LINK = "link"
    PURPOSE_CHOICES = [(LOGIN, "Sign in"), (LINK, "Link account")]

    provider = models.CharField(max_length=16, choices=SocialIdentity.PROVIDER_CHOICES)
    state_hash = models.CharField(max_length=64, unique=True)
    purpose = models.CharField(max_length=8, choices=PURPOSE_CHOICES, default=LOGIN)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="oauth_states",
    )
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    provider_subject = models.CharField(max_length=255, blank=True, default="")
    completion_hash = models.CharField(max_length=64, blank=True, default="", db_index=True)
    completion_expires_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Transaction(models.Model):
    INCOME = "income"
    EXPENSE = "expense"

    TYPE_CHOICES = [
        (INCOME, "Income"),
        (EXPENSE, "Expense"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="transactions",
    )
    name = models.CharField(max_length=150)
    category = models.CharField(max_length=100)
    date = models.DateField()
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    icon = models.CharField(max_length=20, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.name} - {self.amount}"


class Budget(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="budgets",
    )
    category = models.CharField(max_length=100)
    month = models.CharField(
        max_length=7,
        help_text="Month in YYYY-MM format",
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["month", "category"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "category", "month"],
                name="unique_user_budget_category_month",
            )
        ]

    def __str__(self):
        return f"{self.category} - {self.month}"


class SavingsGoal(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="savings_goals",
    )
    name = models.CharField(max_length=150)
    category = models.CharField(max_length=100, default="Personal")
    target_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    deadline = models.DateField(null=True, blank=True)
    description = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["deadline", "name"]

    def __str__(self):
        return self.name


class SavingsContribution(models.Model):
    DEPOSIT = "deposit"
    WITHDRAWAL = "withdrawal"

    TYPE_CHOICES = [
        (DEPOSIT, "Deposit"),
        (WITHDRAWAL, "Withdrawal"),
    ]

    goal = models.ForeignKey(
        SavingsGoal,
        on_delete=models.CASCADE,
        related_name="contributions",
    )
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    date = models.DateField()
    note = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.get_type_display()} - {self.amount}"
