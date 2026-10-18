
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { apiRequest } from "../api";

const TransactionContext = createContext(null);

function loadFromStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);

    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (error) {
    console.error(`Could not load ${key}:`, error);
  }

  return fallback;
}

function createId() {
  return crypto.randomUUID();
}

// Convert Django API records into the format used by the React frontend.
function normalizeTransaction(transaction) {
  return {
    ...transaction,
    amount: Number(transaction.amount),
  };
}

export function TransactionProvider({ children }) {
  // Transactions now come from Django, not the local sample data.
  const [transactions, setTransactions] = useState([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [transactionError, setTransactionError] = useState("");

  // Budgets and savings remain local until their API integration.
  const [budgets, setBudgets] = useState(() =>
    loadFromStorage("pesatrack_budgets", [])
  );

  const [savingsGoals, setSavingsGoals] = useState(() =>
    loadFromStorage("pesatrack_savings", [])
  );

  const refreshTransactions = useCallback(async () => {
    const token = localStorage.getItem("pesatrack_token");

    if (!token) {
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
        throw new Error("The transactions API returned an unexpected response.");
      }

      setTransactions(data.map(normalizeTransaction));
    } catch (error) {
      setTransactionError(error.message || "Could not load transactions.");
      throw error;
    } finally {
      setIsLoadingTransactions(false);
    }
  }, []);

  // Load server transactions when the provider starts.
  useEffect(() => {
    if (localStorage.getItem("pesatrack_token")) {
      refreshTransactions().catch((error) => {
        console.error("Could not load transactions:", error);
      });
    }
  }, [refreshTransactions]);

  // Allow the login page to notify this provider when authentication changes.
  useEffect(() => {
    function handleAuthChange() {
      refreshTransactions().catch((error) => {
        console.error("Could not refresh transactions:", error);
      });
    }

    window.addEventListener("pesatrack-auth-change", handleAuthChange);

    return () => {
      window.removeEventListener("pesatrack-auth-change", handleAuthChange);
    };
  }, [refreshTransactions]);

  // Persist budgets locally for now.
  useEffect(() => {
    try {
      localStorage.setItem("pesatrack_budgets", JSON.stringify(budgets));
    } catch (error) {
      console.error("Could not save budgets:", error);
    }
  }, [budgets]);

  // Persist savings goals locally for now.
  useEffect(() => {
    try {
      localStorage.setItem("pesatrack_savings", JSON.stringify(savingsGoals));
    } catch (error) {
      console.error("Could not save savings goals:", error);
    }
  }, [savingsGoals]);

  // Transactions: Django REST API
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
    await apiRequest(`/transactions/${id}/`, {
      method: "DELETE",
    });

    setTransactions((current) =>
      current.filter((transaction) => String(transaction.id) !== String(id))
    );
  }

  // Budgets: localStorage for now
  function saveBudget(budget) {
    const normalizedBudget = {
      ...budget,
      category: budget.category.trim(),
      amount: Number(budget.amount),
    };

    setBudgets((current) => {
      const existing = current.find(
        (item) =>
          item.category.toLowerCase() ===
            normalizedBudget.category.toLowerCase() &&
          item.month === normalizedBudget.month
      );

      if (existing) {
        return current.map((item) =>
          item.id === existing.id
            ? { ...item, ...normalizedBudget, id: existing.id }
            : item
        );
      }

      return [...current, { ...normalizedBudget, id: createId() }];
    });
  }

  function deleteBudget(id) {
    setBudgets((current) =>
      current.filter((budget) => budget.id !== id)
    );
  }

  // Savings goals: localStorage for now
  function saveSavingsGoal(goal) {
    const normalizedGoal = {
      ...goal,
      name: goal.name.trim(),
      targetAmount: Number(goal.targetAmount),
      contributions: Array.isArray(goal.contributions)
        ? goal.contributions
        : [],
    };

    setSavingsGoals((current) => {
      const existing = current.find((item) => item.id === goal.id);

      if (existing) {
        return current.map((item) =>
          item.id === goal.id
            ? {
                ...item,
                ...normalizedGoal,
                id: item.id,
                contributions: item.contributions || [],
              }
            : item
        );
      }

      return [
        ...current,
        { ...normalizedGoal, id: createId() },
      ];
    });
  }

  function addSavingsContribution(goalId, contribution) {
    const newContribution = {
      ...contribution,
      id: createId(),
      amount: Number(contribution.amount),
    };

    setSavingsGoals((current) =>
      current.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              contributions: [
                ...(goal.contributions || []),
                newContribution,
              ],
            }
          : goal
      )
    );

    return newContribution;
  }

  function deleteSavingsGoal(goalId) {
    setSavingsGoals((current) =>
      current.filter((goal) => goal.id !== goalId)
    );
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

        savingsGoals,
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
    throw new Error(
      "useTransactions must be used inside TransactionProvider"
    );
  }

  return context;
}
