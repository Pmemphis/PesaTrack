
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError

from .models import (
    Transaction,
    Budget,
    SavingsGoal,
    SavingsContribution,
)
from .serializers import (
    TransactionSerializer,
    BudgetSerializer,
    SavingsGoalSerializer,
    SavingsContributionSerializer,
)


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

    def perform_update(self, serializer):
        category = serializer.validated_data.get(
            "category",
            serializer.instance.category,
        )
        month = serializer.validated_data.get(
            "month",
            serializer.instance.month,
        )

        duplicate = Budget.objects.filter(
            user=self.request.user,
            category__iexact=category,
            month=month,
        ).exclude(pk=serializer.instance.pk)

        if duplicate.exists():
            raise ValidationError(
                "A budget already exists for this category and month."
            )

        serializer.save()


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

    def perform_create(self, serializer):
        goal_id = self.request.data.get("goal")

        if not goal_id:
            raise ValidationError(
                {"goal": "A savings goal is required."}
            )

        try:
            goal = SavingsGoal.objects.get(
                pk=goal_id,
                user=self.request.user,
            )
        except SavingsGoal.DoesNotExist:
            raise ValidationError(
                {"goal": "The requested savings goal was not found."}
            )

        serializer.save(goal=goal)
