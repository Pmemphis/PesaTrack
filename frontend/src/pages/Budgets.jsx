
import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import "../App.css";
import { useTransactions } from "../context/TransactionContext";
import AccountPanel from "../components/AccountPanel";

const CATEGORY_OPTIONS = [
  "Food",
  "Transport",
  "Utilities",
  "Rent",
  "Shopping",
  "Health",
  "Education",
  "Business",
  "Entertainment",
  "Freelance",
  "Other",
];

function getCurrentMonth() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatMonth(month) {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return month || "";
  }

  const [year, monthNumber] = month.split("-").map(Number);

  return new Date(year, monthNumber - 1, 1).toLocaleDateString("en-KE", {
    month: "long",
    year: "numeric",
  });
}

function getTransactionMonth(transaction) {
  if (!transaction.date) return "";

  // Prefer the date portion directly to avoid timezone shifts.
  if (/^\d{4}-\d{2}-\d{2}/.test(transaction.date)) {
    return transaction.date.slice(0, 7);
  }

  const date = new Date(transaction.date);

  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function getCategoryKey(category) {
  return String(category || "").trim().toLowerCase();
}

function getCategoryIcon(category) {
  const icons = {
    food: "🍲",
    transport: "🚌",
    utilities: "💡",
    rent: "🏠",
    shopping: "🛍️",
    health: "❤️",
    education: "📚",
    business: "💼",
    entertainment: "🎬",
    freelance: "💻",
    other: "💰",
  };

  return icons[getCategoryKey(category)] || "💰";
}

function Budgets() {
  const {
    transactions = [],
    budgets = [],
    saveBudget,
    deleteBudget,
    isLoadingBudgets = false,
    budgetError = "",
  } = useTransactions();

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [category, setCategory] = useState("Food");
  const [amount, setAmount] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const monthlyBudgets = useMemo(() => {
    return budgets
      .filter((budget) => budget.month === selectedMonth)
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [budgets, selectedMonth]);

  const monthlyExpenses = useMemo(() => {
    return transactions.filter(
      (transaction) =>
        transaction.type === "expense" &&
        getTransactionMonth(transaction) === selectedMonth
    );
  }, [transactions, selectedMonth]);

  const spentByCategory = useMemo(() => {
    const totals = {};

    monthlyExpenses.forEach((transaction) => {
      const key = getCategoryKey(transaction.category);

      if (!key) return;

      totals[key] =
        (totals[key] || 0) + (Number(transaction.amount) || 0);
    });

    return totals;
  }, [monthlyExpenses]);

  function getCategorySpending(categoryName) {
    return spentByCategory[getCategoryKey(categoryName)] || 0;
  }

  const totalBudget = monthlyBudgets.reduce(
    (total, budget) => total + (Number(budget.amount) || 0),
    0
  );

  const totalSpent = monthlyExpenses.reduce(
    (total, transaction) =>
      total + (Number(transaction.amount) || 0),
    0
  );

  const budgetedCategorySpending = monthlyBudgets.reduce(
    (total, budget) => total + getCategorySpending(budget.category),
    0
  );

  // This measures the remaining limits of categories that have budgets.
  const totalRemaining = totalBudget - budgetedCategorySpending;

  const overBudgetCount = monthlyBudgets.filter(
    (budget) =>
      getCategorySpending(budget.category) > Number(budget.amount)
  ).length;

  function resetForm() {
    setCategory("Food");
    setAmount("");
    setEditingId(null);
    setError("");
  }

  function handleMonthChange(value) {
    setSelectedMonth(value);
    resetForm();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const cleanCategory = category.trim();
    const numericAmount = Number(amount);

    if (!cleanCategory) {
      setError("Please enter a budget category.");
      return;
    }

    if (cleanCategory.length > 50) {
      setError("Category name must be 50 characters or fewer.");
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Enter a budget amount greater than zero.");
      return;
    }

    if (!selectedMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth)) {
      setError("Please select a valid budget month.");
      return;
    }

    const duplicate = monthlyBudgets.find(
      (budget) =>
        getCategoryKey(budget.category) ===
          getCategoryKey(cleanCategory) &&
        String(budget.id) !== String(editingId)
    );

    if (duplicate) {
      setError(
        "A budget already exists for this category and month. Edit that budget instead."
      );
      return;
    }

    setIsSaving(true);

    try {
      await saveBudget({
        ...(editingId !== null ? { id: editingId } : {}),
        category: cleanCategory,
        amount: numericAmount,
        month: selectedMonth,
      });

      resetForm();
    } catch (apiError) {
      console.error("Budget save failed:", apiError);

      const serverMessage =
        apiError?.message && apiError.message.length < 300
          ? apiError.message
          : "";

      setError(
        serverMessage
          ? `Could not save budget: ${serverMessage}`
          : "Could not save budget. Check your connection and try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  function handleEdit(budget) {
    setCategory(budget.category);
    setAmount(String(budget.amount));
    setEditingId(budget.id);
    setError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function handleDelete(budget) {
    const confirmed = window.confirm(
      `Delete the ${budget.category} budget for ${formatMonth(
        budget.month
      )}? Your transactions will not be deleted.`
    );

    if (!confirmed) return;

    setDeletingId(budget.id);
    setError("");

    try {
      await deleteBudget(budget.id);

      if (String(editingId) === String(budget.id)) {
        resetForm();
      }
    } catch (apiError) {
      console.error("Budget deletion failed:", apiError);
      setError("Could not delete this budget. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  function getBudgetStatus(budget) {
    const spent = getCategorySpending(budget.category);
    const limit = Number(budget.amount) || 0;

    if (spent > limit) return "over";
    if (limit > 0 && spent >= limit * 0.8) return "warning";

    return "good";
  }

  function getProgress(budget) {
    const limit = Number(budget.amount) || 0;

    if (limit <= 0) return 0;

    return (getCategorySpending(budget.category) / limit) * 100;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">P</div>

          <div>
            <h2>PesaTrack</h2>
            <span>Personal Finance</span>
          </div>
        </div>

        <nav className="navigation">
          <NavLink to="/" end className="nav-link">
            <span>📊</span> Dashboard
          </NavLink>

          <NavLink to="/transactions" className="nav-link">
            <span>💳</span> Transactions
          </NavLink>

          <NavLink to="/budgets" className="nav-link">
            <span>🎯</span> Budgets
          </NavLink>

          <NavLink to="/savings" className="nav-link">
            <span>🐷</span> Savings
          </NavLink>
        </nav>

        <AccountPanel />
      </aside>

      <main className="main-content">
        <header className="page-header">
          <div>
            <p className="eyebrow">PLAN WITH PURPOSE</p>
            <h1>Budgets</h1>
            <p className="page-description">
              Set spending limits and stay in control of your money.
            </p>
          </div>

          <div className="month-picker">
            <label htmlFor="budget-month">Budget month</label>
            <input
              id="budget-month"
              type="month"
              value={selectedMonth}
              onChange={(event) => handleMonthChange(event.target.value)}
            />
          </div>
        </header>

        <section className="summary-grid budget-summary-grid">
          <article className="summary-card">
            <div className="summary-card-top">
              <span>Total budget</span>
              <span className="summary-icon">🎯</span>
            </div>
            <h2>{formatMoney(totalBudget)}</h2>
            <p>
              Across {monthlyBudgets.length}{" "}
              {monthlyBudgets.length === 1 ? "category" : "categories"}
            </p>
          </article>

          <article className="summary-card">
            <div className="summary-card-top">
              <span>Total spent</span>
              <span className="summary-icon">💸</span>
            </div>
            <h2>{formatMoney(totalSpent)}</h2>
            <p>All expenses for {formatMonth(selectedMonth)}</p>
          </article>

          <article className="summary-card">
            <div className="summary-card-top">
              <span>Budget remaining</span>
              <span className="summary-icon">💰</span>
            </div>
            <h2 className={totalRemaining < 0 ? "negative-value" : ""}>
              {formatMoney(totalRemaining)}
            </h2>
            <p>Combined remaining limit for budgeted categories</p>
          </article>

          <article className="summary-card">
            <div className="summary-card-top">
              <span>Over budget</span>
              <span className="summary-icon">⚠️</span>
            </div>
            <h2>{overBudgetCount}</h2>
            <p>
              {overBudgetCount === 1
                ? "Category needs attention"
                : "Categories need attention"}
            </p>
          </article>
        </section>

        <section className="budgets-layout">
          <div className="panel budget-form-panel">
            <div className="panel-header">
              <div>
                <h2>{editingId !== null ? "Edit budget" : "Create a budget"}</h2>
                <p>
                  {editingId !== null
                    ? "Update this category's spending limit."
                    : "Choose a category and set your monthly limit."}
                </p>
              </div>

              <span className="panel-icon">✍️</span>
            </div>

            <form onSubmit={handleSubmit} className="budget-form">
              <div className="form-group">
                <label htmlFor="budget-category">Category</label>

                <input
                  id="budget-category"
                  type="text"
                  list="budget-category-options"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="e.g. Food"
                  maxLength={50}
                  required
                />

                <datalist id="budget-category-options">
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>

                <small>
                  Use the same category name as your expense transactions.
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="budget-amount">Monthly limit (KES)</label>

                <input
                  id="budget-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="e.g. 5000"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="budget-form-month">Month</label>

                <input
                  id="budget-form-month"
                  type="month"
                  value={selectedMonth}
                  onChange={(event) => handleMonthChange(event.target.value)}
                  required
                />
              </div>

              {(error || budgetError) && (
                <p className="budget-error" role="alert">
                  {error || "There is a problem with your budgets. Please refresh and try again."}
                </p>
              )}

              <div className="budget-form-actions">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isSaving}
                >
                  {isSaving
                    ? "Saving..."
                    : editingId !== null
                    ? "Save changes"
                    : "Add budget"}
                </button>

                {editingId !== null && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={resetForm}
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="panel budget-list-panel">
            <div className="panel-header">
              <div>
                <h2>Budget breakdown</h2>
                <p>{formatMonth(selectedMonth)}</p>
              </div>

              <span className="budget-count">
                {monthlyBudgets.length}{" "}
                {monthlyBudgets.length === 1 ? "budget" : "budgets"}
              </span>
            </div>

            {isLoadingBudgets ? (
              <div className="budget-empty-state">
                <div className="empty-state-icon">⏳</div>
                <h3>Loading budgets...</h3>
                <p>Fetching your saved budgets from the server.</p>
              </div>
            ) : budgetError ? (
              <div className="budget-empty-state">
                <div className="empty-state-icon">⚠️</div>
                <h3>Could not load budgets</h3>
                <p>
                  Check your connection and login, then refresh the page.
                </p>
              </div>
            ) : monthlyBudgets.length === 0 ? (
              <div className="budget-empty-state">
                <div className="empty-state-icon">🎯</div>
                <h3>No budgets for this month yet</h3>
                <p>
                  Create your first category budget to start tracking spending.
                  Expense transactions will update progress automatically.
                </p>
              </div>
            ) : (
              <div className="budget-list">
                {monthlyBudgets.map((budget) => {
                  const spent = getCategorySpending(budget.category);
                  const limit = Number(budget.amount) || 0;
                  const remaining = limit - spent;
                  const progress = getProgress(budget);
                  const status = getBudgetStatus(budget);

                  return (
                    <article className="budget-item" key={budget.id}>
                      <div className="budget-item-heading">
                        <div className="budget-category-info">
                          <div className="budget-category-icon">
                            {getCategoryIcon(budget.category)}
                          </div>

                          <div>
                            <h3>{budget.category}</h3>
                            <p>
                              {formatMoney(spent)} spent of{" "}
                              {formatMoney(limit)}
                            </p>
                          </div>
                        </div>

                        <span className={`budget-status ${status}`}>
                          {status === "over"
                            ? "Over budget"
                            : status === "warning"
                            ? "Near limit"
                            : "On track"}
                        </span>
                      </div>

                      <div
                        className="budget-progress-track"
                        role="progressbar"
                        aria-label={`${budget.category} budget usage`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.min(100, Math.round(progress))}
                      >
                        <div
                          className={`budget-progress-fill ${status}`}
                          style={{
                            width: `${Math.min(100, Math.max(0, progress))}%`,
                          }}
                        />
                      </div>

                      <div className="budget-item-footer">
                        <span>{Math.round(progress)}% used</span>

                        <strong
                          className={remaining < 0 ? "negative-value" : ""}
                        >
                          {remaining < 0
                            ? `${formatMoney(Math.abs(remaining))} over`
                            : `${formatMoney(remaining)} left`}
                        </strong>
                      </div>

                      <div className="budget-item-actions">
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => handleEdit(budget)}
                          disabled={deletingId !== null || isSaving}
                        >
                          Edit limit
                        </button>

                        <button
                          type="button"
                          className="text-button delete-text-button"
                          onClick={() => handleDelete(budget)}
                          disabled={deletingId !== null || isSaving}
                        >
                          {String(deletingId) === String(budget.id)
                            ? "Deleting..."
                            : "Delete"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="panel budget-tip-panel">
          <div className="budget-tip-icon">💡</div>

          <div>
            <h3>A simple budgeting rule</h3>
            <p>
              Set realistic limits based on your income and expenses. Record
              expenses with consistent category names so PesaTrack can match
              them to the correct budgets.
            </p>
          </div>
        </section>

        <footer className="page-footer">
          <span>PesaTrack · Personal Finance</span>
          <span>Budgets synced with your account</span>
        </footer>
      </main>
    </div>
  );
}

export default Budgets;
