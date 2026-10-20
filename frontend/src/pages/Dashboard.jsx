import { useState } from "react";
import { NavLink } from "react-router-dom";
import "../App.css";
import { useTransactions } from "../context/TransactionContext";
import AccountPanel from "../components/AccountPanel";
import { useAuth } from "../context/useAuth";

const money = (amount) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(amount);

const compactMoney = (amount) =>
  new Intl.NumberFormat("en-KE", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getTransactionMonth(date) {
  if (!date) return "";
  if (/^\d{4}-\d{2}/.test(date)) return date.slice(0, 7);

  const parsedDate = new Date(date);
  return Number.isNaN(parsedDate.getTime()) ? "" : getMonthKey(parsedDate);
}

function getMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-KE", {
    month: "short",
    year: "2-digit",
  });
}

function getChartAxisMaximum(value) {
  if (value <= 0) return 1000;

  const roughStep = value / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const fraction = roughStep / magnitude;
  const step =
    fraction <= 1 ? magnitude : fraction <= 2 ? 2 * magnitude : fraction <= 5 ? 5 * magnitude : 10 * magnitude;

  return Math.ceil(value / (step * 4)) * step * 4;
}

function userInitials(user) {
  return [user?.first_name, user?.last_name]
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .join("") || user?.email?.[0]?.toUpperCase() || "?";
}

function getCategoryIcon(category) {
  const icons = {
    food: "🍲",
    transport: "🚗",
    utilities: "📱",
    rent: "🏠",
    shopping: "🛍️",
    health: "❤️",
    education: "📚",
    business: "💼",
    entertainment: "🎬",
  };

  return icons[category.trim().toLowerCase()] || "📊";
}

const formatDate = (date) => {
  if (!date) return "—";

  // Handle ISO dates without timezone shifting.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (match) {
    const [, year, month, day] = match;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    ).toLocaleDateString("en-KE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  // Also supports existing dates saved in a readable format.
  return date;
};

const navigation = [
  { icon: "⌂", label: "Dashboard", href: "/" },
  { icon: "⇄", label: "Transactions", href: "/transactions" },
  { icon: "▤", label: "Budgets", href: "/budgets" },
  { icon: "◎", label: "Savings", href: "/savings" },
];

function Dashboard() {
  const { user } = useAuth();
  const {
    transactions,
    isLoadingTransactions,
    transactionError,
    budgets,
    isLoadingBudgets,
    budgetError,
    addTransaction: createTransaction,
    deleteTransaction: removeTransaction,
  } = useTransactions();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense");
  const [category, setCategory] = useState("Food");
  const [formError, setFormError] = useState("");
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);
  const [deletingTransactionId, setDeletingTransactionId] = useState(null);
  const [transactionActionError, setTransactionActionError] = useState("");
  const [now] = useState(() => new Date());

  const totalIncome = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((total, transaction) => total + Number(transaction.amount), 0);

  const totalExpenses = transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((total, transaction) => total + Number(transaction.amount), 0);

  const balance = totalIncome - totalExpenses;
  const netSavings = balance;
  const savingsRate =
    totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

  const currentMonthKey = getMonthKey(now);
  const currentMonthBudgets = budgets.filter(
    (budget) => budget.month === currentMonthKey
  );
  const currentMonthExpenses = transactions.filter(
    (transaction) =>
      transaction.type === "expense" &&
      getTransactionMonth(transaction.date) === currentMonthKey
  );
  const getBudgetedSpending = (categoryName) =>
    currentMonthExpenses
      .filter(
        (transaction) =>
          transaction.category.trim().toLowerCase() ===
          categoryName.trim().toLowerCase()
      )
      .reduce((total, transaction) => total + Number(transaction.amount), 0);
  const totalMonthlyBudget = currentMonthBudgets.reduce(
    (total, budget) => total + Number(budget.amount),
    0
  );
  const totalBudgetedSpending = currentMonthBudgets.reduce(
    (total, budget) => total + getBudgetedSpending(budget.category),
    0
  );
  const budgetUsage =
    totalMonthlyBudget > 0
      ? (totalBudgetedSpending / totalMonthlyBudget) * 100
      : 0;
  const topBudgets = [...currentMonthBudgets]
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 3);

  const cashFlow = Array.from({ length: 6 }, (_, index) => {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const key = getMonthKey(monthDate);

    return { key, label: getMonthLabel(key), income: 0, expense: 0 };
  });
  const cashFlowByMonth = new Map(cashFlow.map((month) => [month.key, month]));

  transactions.forEach((transaction) => {
    const month = cashFlowByMonth.get(getTransactionMonth(transaction.date));
    if (month && (transaction.type === "income" || transaction.type === "expense")) {
      month[transaction.type] += Number(transaction.amount) || 0;
    }
  });

  const chartAxisMaximum = getChartAxisMaximum(
    Math.max(0, ...cashFlow.flatMap((month) => [month.income, month.expense]))
  );
  const chartAxisLabels = [4, 3, 2, 1, 0].map((step) =>
    compactMoney((chartAxisMaximum / 4) * step)
  );

  async function handleAddTransaction(event) {
    event.preventDefault();

    const trimmedName = name.trim();
    const numericAmount = Number(amount);

    if (!trimmedName) {
      setFormError("Please enter a transaction name.");
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFormError("Enter an amount greater than zero.");
      return;
    }

    setIsSavingTransaction(true);

    try {
      await createTransaction({
        name: trimmedName,
        category,
        date: new Date().toLocaleDateString("en-CA"),
        amount: numericAmount,
        type,
        icon: type === "income" ? "💰" : "💳",
      });

      setName("");
      setAmount("");
      setType("expense");
      setCategory("Food");
      setFormError("");
      setShowForm(false);
    } catch (error) {
      console.error("Transaction save failed:", error);
      setFormError("Could not save the transaction. Check your connection and try again.");
    } finally {
      setIsSavingTransaction(false);
    }
  }

  async function handleDeleteTransaction(id) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this transaction?"
    );

    if (confirmed) {
      setDeletingTransactionId(id);
      setTransactionActionError("");

      try {
        await removeTransaction(id);
      } catch (error) {
        console.error("Transaction deletion failed:", error);
        setTransactionActionError(
          "Could not delete the transaction. Check your connection and try again."
        );
      } finally {
        setDeletingTransactionId(null);
      }
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink className="brand" to="/">
          <span className="brand-icon">P</span>
          <span>
            PesaTrack<span className="brand-dot">.</span>
          </span>
        </NavLink>

        <p className="nav-heading">WORKSPACE</p>

        <nav className="navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.label}
              to={item.href}
              end={item.href === "/"}
              className={({ isActive }) =>
                `nav-link${isActive ? " active" : ""}`
              }
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon">✦</span>
            <strong>Your money, your future.</strong>
            <p>Small steps today. Better finances tomorrow.</p>
          </div>

          <AccountPanel />
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> Dashboard
          </div>

          <div className="topbar-right">
            <span className="demo-badge">ACCOUNT DATA</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Notifications"
            >
              ♧
            </button>
            <div className="avatar small-avatar">{userInitials(user)}</div>
          </div>
        </header>

        <section className="page-heading">
          <div>
            <p className="eyebrow">YOUR FINANCIAL OVERVIEW</p>
            <h1>Good morning 👋</h1>
            <p className="muted">
              Here's what's happening with your money.
            </p>
          </div>

          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setFormError("");
              setShowForm((current) => !current);
            }}
          >
            <span>{showForm ? "−" : "＋"}</span>
            {showForm ? "Cancel" : "Add transaction"}
          </button>
        </section>

        {showForm && (
          <section className="panel transaction-form-panel">
            <div className="panel-heading">
              <div>
                <h3>Add a transaction</h3>
                <p className="muted">
                  Record money coming in or going out.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleAddTransaction}
              className="transaction-form"
            >
              <label>
                Transaction name
                <input
                  type="text"
                  placeholder="e.g. Salary, groceries"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  required
                />
              </label>

              <label>
                Amount (KES)
                <input
                  type="number"
                  placeholder="e.g. 1500"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  min="0.01"
                  step="0.01"
                  required
                />
              </label>

              <label>
                Transaction type
                <select
                  value={type}
                  onChange={(event) => {
                    const selectedType = event.target.value;
                    setType(selectedType);
                    setCategory(
                      selectedType === "income" ? "Income" : "Food"
                    );
                  }}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </label>

              <label>
                Category
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {type === "income" ? (
                    <>
                      <option value="Income">Income</option>
                      <option value="Salary">Salary</option>
                      <option value="Business">Business</option>
                      <option value="Freelance">Freelance</option>
                      <option value="Other income">Other income</option>
                    </>
                  ) : (
                    <>
                      <option value="Food">Food</option>
                      <option value="Transport">Transport</option>
                      <option value="Utilities">Utilities</option>
                      <option value="Education">Education</option>
                      <option value="Shopping">Shopping</option>
                      <option value="Business">Business</option>
                      <option value="Health">Health</option>
                      <option value="Other">Other</option>
                    </>
                  )}
                </select>
              </label>

              {formError && (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              )}

              <div className="form-actions">
                <button
                  type="button"
                  className="period-button"
                  onClick={() => {
                    setShowForm(false);
                    setFormError("");
                  }}
                  disabled={isSavingTransaction}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={isSavingTransaction}
                >
                  {isSavingTransaction ? "Saving..." : "Save transaction"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="summary-grid">
          <article className="summary-card balance-card">
            <div className="card-top">
              <span>Total balance</span>
              <span className="card-icon balance-icon">◈</span>
            </div>
            <h2>{money(balance)}</h2>
            <p className="card-foot">
              <span className="trend">Live total</span>
              <span>from listed transactions</span>
            </p>
            <div className="balance-decoration">KES</div>
          </article>

          <article className="summary-card">
            <div className="card-top">
              <span>Total income</span>
              <span className="card-icon income-icon">↙</span>
            </div>
            <h2>{money(totalIncome)}</h2>
            <p className="card-foot">
              <span className="trend">All recorded</span>
              <span>income transactions</span>
            </p>
          </article>

          <article className="summary-card">
            <div className="card-top">
              <span>Total expenses</span>
              <span className="card-icon expense-icon">↗</span>
            </div>
            <h2>{money(totalExpenses)}</h2>
            <p className="card-foot">
              <span className="negative-trend">All recorded</span>
              <span>expense transactions</span>
            </p>
          </article>

          <article className="summary-card">
            <div className="card-top">
              <span>Net savings</span>
              <span className="card-icon savings-icon">◎</span>
            </div>
            <h2>{money(netSavings)}</h2>
            <p className="card-foot">
              <span className="trend">{savingsRate.toFixed(1)}%</span>
              <span>of income retained</span>
            </p>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel chart-panel">
            <div className="panel-heading">
              <div>
                <h3>Cash flow</h3>
                <p className="muted">Income and expenses by month</p>
              </div>
              <span className="period-button">Last 6 months</span>
            </div>

            <div className="chart-legend">
              <span>
                <i className="legend-dot income-dot" /> Income
              </span>
              <span>
                <i className="legend-dot expense-dot" /> Expenses
              </span>
            </div>

            <div className="chart">
              <div className="y-axis">
                {chartAxisLabels.map((label, index) => (
                  <span key={`${label}-${index}`}>{label}</span>
                ))}
              </div>

              <div className="chart-plot">
                {cashFlow.map((item) => (
                  <div className="chart-column" key={item.key}>
                    <div className="bar-pair">
                      <div
                        className="bar income-bar"
                        style={{
                          height: `${(item.income / chartAxisMaximum) * 100}%`,
                          minHeight: item.income > 0 ? undefined : 0,
                        }}
                        title={`${item.label} income: ${money(item.income)}`}
                      />
                      <div
                        className="bar expense-bar"
                        style={{
                          height: `${(item.expense / chartAxisMaximum) * 100}%`,
                          minHeight: item.expense > 0 ? undefined : 0,
                        }}
                        title={`${item.label} expenses: ${money(item.expense)}`}
                      />
                    </div>
                    <span className="month-label">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {isLoadingTransactions && (
              <p className="muted">Loading your cash flow...</p>
            )}
            {!isLoadingTransactions && transactionError && (
              <p className="form-error" role="alert">
                Could not load cash flow. Check your connection and refresh.
              </p>
            )}
            {!isLoadingTransactions &&
              !transactionError &&
              transactions.length === 0 && (
                <p className="muted">Record a transaction to see your cash flow.</p>
              )}
          </article>

          <article className="panel budget-panel">
            <div className="panel-heading">
              <div>
                <h3>Budget overview</h3>
                <p className="muted">{getMonthLabel(currentMonthKey)}</p>
              </div>
            </div>

            {isLoadingBudgets ? (
              <p className="muted">Loading this month’s budgets...</p>
            ) : budgetError ? (
              <p className="form-error" role="alert">
                Could not load budgets. Check your connection and refresh.
              </p>
            ) : currentMonthBudgets.length === 0 ? (
              <p className="muted">
                No budgets for this month yet. Set one to track category spending.
              </p>
            ) : (
              <>
                <div className="budget-total">
                  <div>
                    <span className="muted">Spent in budgeted categories</span>
                    <h2>{money(totalBudgetedSpending)}</h2>
                  </div>
                  <span className="budget-limit">of {money(totalMonthlyBudget)}</span>
                </div>

                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label="Overall monthly budget usage"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(100, Math.round(budgetUsage))}
                >
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.min(100, budgetUsage)}%` }}
                  />
                </div>

                <p className="budget-caption">
                  {Math.round(budgetUsage)}% of monthly limits used
                </p>

                {topBudgets.map((budget, index) => {
                  const spent = getBudgetedSpending(budget.category);
                  const limit = Number(budget.amount) || 0;
                  const progress = limit > 0 ? (spent / limit) * 100 : 0;
                  const colors = ["#f1b45f", "#5ea9e9", "#25b995"];

                  return (
                    <div className="budget-item" key={budget.id}>
                      <div className="budget-item-top">
                        <span>
                          {getCategoryIcon(budget.category)} {budget.category}
                        </span>
                        <span>
                          {money(spent)} / {money(limit)}
                        </span>
                      </div>
                      <div className="progress-track">
                        <div
                          className="category-fill"
                          style={{
                            width: `${Math.min(100, progress)}%`,
                            backgroundColor: colors[index],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            <NavLink className="view-all" to="/budgets">
              Manage budgets →
            </NavLink>
          </article>
        </section>

        <section className="panel transactions-panel">
          <div className="panel-heading">
            <div>
              <h3>Recent transactions</h3>
              <p className="muted">
                {transactions.length} recorded transaction
                {transactions.length === 1 ? "" : "s"}
              </p>
            </div>
            <NavLink className="view-all" to="/transactions">
              View all →
            </NavLink>
          </div>

          {transactionActionError && (
            <p className="form-error" role="alert">
              {transactionActionError}
            </p>
          )}

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>TRANSACTION</th>
                  <th>CATEGORY</th>
                  <th>DATE</th>
                  <th className="amount-cell">AMOUNT</th>
                  <th>ACTION</th>
                </tr>
              </thead>

              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>
                      <div className="transaction-name">
                        <span className="transaction-icon">
                          {transaction.icon || "💳"}
                        </span>
                        <strong>{transaction.name}</strong>
                      </div>
                    </td>

                    <td>
                      <span className="category-label">
                        {transaction.category}
                      </span>
                    </td>

                    <td className="date-cell">
                      {formatDate(transaction.date)}
                    </td>

                    <td className={`amount-cell ${transaction.type}`}>
                      {transaction.type === "income" ? "+" : "−"}
                      {money(Number(transaction.amount))}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="delete-button"
                        disabled={deletingTransactionId !== null}
                        onClick={() =>
                          handleDeleteTransaction(transaction.id)
                        }
                        aria-label={`Delete ${transaction.name}`}
                        title="Delete transaction"
                      >
                        {String(deletingTransactionId) ===
                        String(transaction.id)
                          ? "Deleting..."
                          : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}

                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty-state">
                      No transactions yet. Add your first transaction above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="demo-note">
            Transactions and budgets are synced with your account.
          </p>
        </section>

        <section className="panel savings-panel">
          <div className="panel-heading">
            <div>
              <h3>Savings goals</h3>
              <p className="muted">Track progress toward your savings targets.</p>
            </div>
          </div>

          <p className="muted">
            Review your goals and contributions on the Savings page.
          </p>

          <NavLink className="view-all" to="/savings">
            Explore savings →
          </NavLink>
        </section>

        <footer className="footer">
          <span>© 2026 PesaTrack</span>
          <span>
            Built for better financial habits.{" "}
            <span className="footer-heart">♥</span>
          </span>
        </footer>
      </main>
    </div>
  );
}

export default Dashboard;
