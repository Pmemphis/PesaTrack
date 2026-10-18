
from django.contrib import admin
from .models import (
    Transaction,
    Budget,
    SavingsGoal,
    SavingsContribution,
)


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "type", "category", "amount", "date")
    list_filter = ("type", "category", "date")
    search_fields = ("name", "category", "user__username")


@admin.register(Budget)
class BudgetAdmin(admin.ModelAdmin):
    list_display = ("user", "category", "month", "amount")
    list_filter = ("month", "category")


@admin.register(SavingsGoal)
class SavingsGoalAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "target_amount", "deadline")
    search_fields = ("name", "user__username")


@admin.register(SavingsContribution)
class SavingsContributionAdmin(admin.ModelAdmin):
    list_display = ("goal", "type", "amount", "date")
    list_filter = ("type", "date")
