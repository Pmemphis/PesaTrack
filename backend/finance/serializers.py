
from rest_framework import serializers
from .models import (
    Transaction,
    Budget,
    SavingsGoal,
    SavingsContribution,
)


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
