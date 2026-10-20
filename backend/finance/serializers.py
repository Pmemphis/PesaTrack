
from rest_framework import serializers
from django.contrib.auth import get_user_model, password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import (
    Transaction,
    Budget,
    SavingsGoal,
    SavingsContribution,
)


User = get_user_model()


class RegistrationSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value.lower()

    def validate_password(self, value):
        try:
            password_validation.validate_password(value)
        except DjangoValidationError as error:
            raise serializers.ValidationError(list(error.messages))
        return value

    def create(self, validated_data):
        name = validated_data["name"].strip()
        parts = name.split(maxsplit=1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ""
        email = validated_data["email"]
        username_base = email.split("@", maxsplit=1)[0][:150]
        username = username_base
        suffix = 1
        while User.objects.filter(username__iexact=username).exists():
            suffix_text = str(suffix)
            username = f"{username_base[:150 - len(suffix_text)]}{suffix_text}"
            suffix += 1

        return User.objects.create_user(
            username=username,
            email=email,
            first_name=first_name,
            last_name=last_name,
            password=validated_data["password"],
        )


class UserProfileSerializer(serializers.ModelSerializer):
    social_providers = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "social_providers",
        )

    def get_social_providers(self, user):
        return list(user.social_identities.values_list("provider", flat=True))


class TransactionSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source="user.username")

    class Meta:
        model = Transaction
        fields = [
            "id",
            "user",
            "name",
            "category",
            "date",
            "amount",
            "type",
            "icon",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class BudgetSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source="user.username")

    class Meta:
        model = Budget
        fields = [
            "id",
            "user",
            "category",
            "month",
            "amount",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user", "created_at", "updated_at"]

    def validate_month(self, value):
        import re

        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", value):
            raise serializers.ValidationError(
                "Enter a valid month in YYYY-MM format, for example 2026-10."
            )
        return value

    def validate(self, attrs):
        category = attrs.get(
            "category",
            self.instance.category if self.instance else None,
        )
        month = attrs.get(
            "month",
            self.instance.month if self.instance else None,
        )
        duplicate = Budget.objects.filter(
            user=self.context["request"].user,
            category__iexact=category,
            month=month,
        )

        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)

        if duplicate.exists():
            raise serializers.ValidationError(
                {
                    "category": "A budget already exists for this category and month."
                }
            )

        return attrs


class SavingsGoalSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source="user.username")

    class Meta:
        model = SavingsGoal
        fields = [
            "id",
            "user",
            "name",
            "category",
            "target_amount",
            "deadline",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class SavingsContributionSerializer(serializers.ModelSerializer):
    goal = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = SavingsContribution
        fields = [
            "id",
            "goal",
            "type",
            "amount",
            "date",
            "note",
            "created_at",
        ]
        read_only_fields = ["id", "goal", "created_at"]
