
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { apiRequest } from "../api";

const TransactionContext = createContext(null);

function loadLegacySavings() {
  try {
    const saved = localStorage.getItem("pesatrack_savings");
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Could not read older browser savings data:", error);
    return [];
  }
}

function loadSavingsImportProgress(key) {
  try {
    const saved = localStorage.getItem(key);
    const parsed = saved ? JSON.parse(saved) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (error) {
    console.error("Could not read savings import progress:", error);
    return {};
  }
}

function normalizeTransaction(transaction) {
  return { ...transaction, amount: Number(transaction.amount) };
}

function normalizeBudget(budget) {
  return { ...budget, amount: Number(budget.amount) };
}

function normalizeContribution(contribution) {
  return { ...contribution, amount: Number(contribution.amount) };
}

function normalizeSavingsGoal(goal, contributions = []) {
  return {
    ...goal,
    targetAmount: Number(goal.target_amount),
    contributions: contributions.map(normalizeContribution),
  };
}

export function TransactionProvider({ children }) {
  const [transactions, setTransactions] = useState([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [transactionError, setTransactionError] = useState("");

  const [budgets, setBudgets] = useState([]);
  const [isLoadingBudgets, setIsLoadingBudgets] = useState(false);
  const [budgetError, setBudgetError] = useState("");

  const [savingsGoals, setSavingsGoals] = useState([]);
  const [legacySavingsGoals, setLegacySavingsGoals] =
    useState(loadLegacySavings);
  const [isLoadingSavingsGoals, setIsLoadingSavingsGoals] = useState(false);
  const [savingsError, setSavingsError] = useState("");

  const refreshTransactions = useCallback(async () => {
    if (!localStorage.getItem("pesatrack_token")) {
      setTransactions([]);
      setTransactionError("");
      setIsLoadingTransactions(false);
      return;
    }

    setIsLoadingTransactions(true);
    setTransactionError("");

    try {
      const data = await apiRequest("/transactions/");

      if (!Array.isArray(data)) {
        throw new Error("Unexpected transactions API response.");
      }

      setTransactions(data.map(normalizeTransaction));
    } catch (error) {
      setTransactionError(error.message || "Could not load transactions.");
      throw error;
    } finally {
      setIsLoadingTransactions(false);
    }
  }, []);

  const refreshBudgets = useCallback(async () => {
    if (!localStorage.getItem("pesatrack_token")) {
      setBudgets([]);
      setBudgetError("");
      setIsLoadingBudgets(false);
      return;
    }

    setIsLoadingBudgets(true);
    setBudgetError("");

    try {
      const data = await apiRequest("/budgets/");

      if (!Array.isArray(data)) {
        throw new Error("Unexpected budgets API response.");
      }

      setBudgets(data.map(normalizeBudget));
    } catch (error) {
      setBudgetError(error.message || "Could not load budgets.");
      throw error;
    } finally {
      setIsLoadingBudgets(false);
    }
  }, []);

  const refreshSavingsGoals = useCallback(async () => {
    if (!localStorage.getItem("pesatrack_token")) {
      setSavingsGoals([]);
      setSavingsError("");
      setIsLoadingSavingsGoals(false);
      return;
    }

    setIsLoadingSavingsGoals(true);
    setSavingsError("");

    try {
      const [goals, contributions] = await Promise.all([
        apiRequest("/savings-goals/"),
        apiRequest("/savings-contributions/"),
      ]);

      if (!Array.isArray(goals) || !Array.isArray(contributions)) {
        throw new Error("Unexpected savings API response.");
      }

      setSavingsGoals(
        goals.map((goal) =>
          normalizeSavingsGoal(
            goal,
            contributions.filter(
              (contribution) => String(contribution.goal) === String(goal.id)
            )
          )
        )
      );
    } catch (error) {
      setSavingsError(error.message || "Could not load savings goals.");
      throw error;
    } finally {
      setIsLoadingSavingsGoals(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshTransactions(),
      refreshBudgets(),
      refreshSavingsGoals(),
    ]);
  }, [refreshTransactions, refreshBudgets, refreshSavingsGoals]);

  useEffect(() => {
    if (localStorage.getItem("pesatrack_token")) {
      refreshAll().catch((error) => {
        console.error("Could not load PesaTrack data:", error);
      });
    }
  }, [refreshAll]);

  useEffect(() => {
    function handleAuthChange() {
      refreshAll().catch((error) => {
        console.error("Could not refresh PesaTrack data:", error);
      });
    }

    window.addEventListener("pesatrack-auth-change", handleAuthChange);
    return () =>
      window.removeEventListener("pesatrack-auth-change", handleAuthChange);
  }, [refreshAll]);

  // Transactions: Django API
  async function addTransaction(transaction) {
    const payload = {
      name: transaction.name.trim(),
      category: transaction.category.trim(),
      date: transaction.date,
      amount: Number(transaction.amount),
      type: transaction.type,
      icon: transaction.icon || "",
    };

    const created = await apiRequest("/transactions/", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const normalized = normalizeTransaction(created);

    setTransactions((current) => [
      normalized,
      ...current.filter((item) => item.id !== normalized.id),
    ]);

    setTransactionError("");
    return normalized;
  }

  async function deleteTransaction(id) {
    await apiRequest(`/transactions/${id}/`, { method: "DELETE" });

    setTransactions((current) =>
      current.filter((item) => String(item.id) !== String(id))
    );
  }

  // Budgets: Django API
  async function saveBudget(budget) {
    const payload = {
      category: budget.category.trim(),
      month: budget.month,
      amount: Number(budget.amount),
    };

    setBudgetError("");

    try {
      let saved;

      if (budget.id !== undefined && budget.id !== null) {
        saved = await apiRequest(`/budgets/${budget.id}/`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        saved = await apiRequest("/budgets/", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      const normalized = normalizeBudget(saved);

      setBudgets((current) => {
        const exists = current.some(
          (item) => String(item.id) === String(normalized.id)
        );

        if (exists) {
          return current.map((item) =>
            String(item.id) === String(normalized.id) ? normalized : item
          );
        }

        return [...current, normalized];
      });

      return normalized;
    } catch (error) {
      setBudgetError(error.message || "Could not save budget.");
      throw error;
    }
  }

  async function deleteBudget(id) {
    setBudgetError("");

    try {
      await apiRequest(`/budgets/${id}/`, { method: "DELETE" });

      setBudgets((current) =>
        current.filter((budget) => String(budget.id) !== String(id))
      );
    } catch (error) {
      setBudgetError(error.message || "Could not delete budget.");
      throw error;
    }
  }

  // Savings goals and contribution history: Django API.
  async function saveSavingsGoal(goal) {
    const payload = {
      name: goal.name.trim(),
      category: goal.category,
      target_amount: Number(goal.targetAmount),
      deadline: goal.deadline || null,
      description: goal.description.trim(),
    };

    setSavingsError("");

    const saved =
      goal.id !== undefined && goal.id !== null
        ? await apiRequest(`/savings-goals/${goal.id}/`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiRequest("/savings-goals/", {
            method: "POST",
            body: JSON.stringify(payload),
          });

    setSavingsGoals((current) => {
      const existing = current.find(
        (item) => String(item.id) === String(saved.id)
      );
      const normalized = normalizeSavingsGoal(
        saved,
        existing?.contributions || []
      );

      return existing
        ? current.map((item) =>
            String(item.id) === String(saved.id) ? normalized : item
          )
        : [...current, normalized];
    });

    return saved;
  }

  async function addSavingsContribution(goalId, contribution) {
    setSavingsError("");

    const saved = await apiRequest("/savings-contributions/", {
      method: "POST",
      body: JSON.stringify({
        goal: goalId,
        type: contribution.type,
        amount: Number(contribution.amount),
        date: contribution.date,
        note: contribution.note.trim(),
      }),
    });
    const normalized = normalizeContribution(saved);

    setSavingsGoals((current) =>
      current.map((goal) =>
        String(goal.id) === String(goalId)
          ? {
              ...goal,
              contributions: [...(goal.contributions || []), normalized],
            }
          : goal
      )
    );

    return normalized;
  }

  async function deleteSavingsGoal(goalId) {
    setSavingsError("");

    await apiRequest(`/savings-goals/${goalId}/`, { method: "DELETE" });
    setSavingsGoals((current) =>
      current.filter((goal) => String(goal.id) !== String(goalId))
    );
  }

  async function importLegacySavingsGoals() {
    const token = localStorage.getItem("pesatrack_token");
    if (!token) throw new Error("Sign in before importing savings goals.");

    const progressKey = `pesatrack_savings_import_${token}`;
    const progress = loadSavingsImportProgress(progressKey);
    setSavingsError("");

    for (const [index, legacyGoal] of legacySavingsGoals.entries()) {
      const legacyGoalId = String(
        legacyGoal.id ?? `${legacyGoal.name}-${legacyGoal.targetAmount}-${index}`
      );
      const checkpoint = progress[legacyGoalId] || {
        contributionIds: [],
      };

      if (checkpoint.goalId) {
        await apiRequest(`/savings-goals/${checkpoint.goalId}/`);
      } else {
        const createdGoal = await apiRequest("/savings-goals/", {
          method: "POST",
          body: JSON.stringify({
            name: String(legacyGoal.name || "Imported savings goal").trim(),
            category: legacyGoal.category || "Personal",
            target_amount: Number(
              legacyGoal.targetAmount ?? legacyGoal.target_amount
            ),
            deadline: legacyGoal.deadline || null,
            description: String(legacyGoal.description || ""),
          }),
        });
        checkpoint.goalId = createdGoal.id;
        checkpoint.contributionIds = checkpoint.contributionIds || [];
        progress[legacyGoalId] = checkpoint;
        localStorage.setItem(progressKey, JSON.stringify(progress));
      }

      for (const [contributionIndex, contribution] of (
        legacyGoal.contributions || []
      ).entries()) {
        const contributionId = String(contribution.id ?? contributionIndex);
        if (checkpoint.contributionIds.includes(contributionId)) continue;

        await apiRequest("/savings-contributions/", {
          method: "POST",
          body: JSON.stringify({
            goal: checkpoint.goalId,
            type: contribution.type,
            amount: Number(contribution.amount),
            date: contribution.date,
            note: String(contribution.note || ""),
          }),
        });

        checkpoint.contributionIds.push(contributionId);
        localStorage.setItem(progressKey, JSON.stringify(progress));
      }
    }

    await refreshSavingsGoals();

    localStorage.setItem("pesatrack_savings", JSON.stringify([]));
    localStorage.removeItem(progressKey);
    setLegacySavingsGoals([]);
  }

  return (
    <TransactionContext.Provider
      value={{
        transactions,
        addTransaction,
        deleteTransaction,
        refreshTransactions,
        isLoadingTransactions,
        transactionError,

        budgets,
        saveBudget,
        deleteBudget,
        refreshBudgets,
        isLoadingBudgets,
        budgetError,

        savingsGoals,
        legacySavingsGoals,
        isLoadingSavingsGoals,
        savingsError,
        refreshSavingsGoals,
        importLegacySavingsGoals,
        saveSavingsGoal,
        addSavingsContribution,
        deleteSavingsGoal,
      }}
    >
      {children}
    </TransactionContext.Provider>
  );
}

export function useTransactions() {
  const context = useContext(TransactionContext);

  if (!context) {
    throw new Error("useTransactions must be used inside TransactionProvider");
  }

  return context;
}
