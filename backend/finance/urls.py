
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    TransactionViewSet,
    BudgetViewSet,
    SavingsGoalViewSet,
    SavingsContributionViewSet,
)

router = DefaultRouter()
router.register("transactions", TransactionViewSet, basename="transaction")
router.register("budgets", BudgetViewSet, basename="budget")
router.register("savings-goals", SavingsGoalViewSet, basename="savings-goal")
router.register(
    "savings-contributions",
    SavingsContributionViewSet,
    basename="savings-contribution",
)

urlpatterns = [
    path("", include(router.urls)),
]
