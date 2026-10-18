import { useState } from "react";
import { NavLink } from "react-router-dom";
import "../App.css";
import { useTransactions } from "../context/TransactionContext";

const monthlyData = [
  { month: "May", income: 45, expense: 25 },
  { month: "Jun", income: 65, expense: 35 },
  { month: "Jul", income: 55, expense: 40 },
  { month: "Aug", income: 80, expense: 48 },
  { month: "Sep", income: 70, expense: 38 },
  { month: "Oct", income: 90, expense: 52 },
];

const money = (amount) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(amount);

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
  const {
    transactions,
    addTransaction: createTransaction,
    deleteTransaction: removeTransaction,
  } = useTransactions();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense");
  const [category, setCategory] = useState("Food");
  const [formError, setFormError] = useState("");

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

  function handleAddTransaction(event) {
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

    createTransaction({
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
  }

  function handleDeleteTransaction(id) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this transaction?"
    );

    if (confirmed) {
      removeTransaction(id);
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

          <div className="profile">
            <div className="avatar">PM</div>
            <div>
              <strong>My Account</strong>
              <span>Personal workspace</span>
            </div>
            <span className="profile-menu">•••</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> Dashboard
          </div>

          <div className="topbar-right">
            <span className="demo-badge">DEMO DATA</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Notifications"
            >
              ♧
            </button>
            <div className="avatar small-avatar">PM</div>
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
                >
                  Cancel
                </button>

                <button type="submit" className="primary-button">
                  Save transaction
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
                <p className="muted">Illustrative monthly trends</p>
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
                <span>10k</span>
                <span>7.5k</span>
                <span>5k</span>
                <span>2.5k</span>
                <span>0</span>
              </div>

              <div className="chart-plot">
                {monthlyData.map((item) => (
                  <div className="chart-column" key={item.month}>
                    <div className="bar-pair">
                      <div
                        className="bar income-bar"
                        style={{ height: `${item.income}%` }}
                        title="Illustrative income"
                      />
                      <div
                        className="bar expense-bar"
                        style={{ height: `${item.expense}%` }}
                        title="Illustrative expenses"
                      />
                    </div>
                    <span className="month-label">{item.month}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="panel budget-panel">
            <div className="panel-heading">
              <div>
                <h3>Budget overview</h3>
                <p className="muted">Illustrative monthly budget</p>
              </div>
              <button
                type="button"
                className="more-button"
                aria-label="More budget options"
              >
                •••
              </button>
            </div>

            <div className="budget-total">
              <div>
                <span className="muted">Sample spending</span>
                <h2>{money(14650)}</h2>
              </div>
              <span className="budget-limit">of {money(25000)}</span>
            </div>

            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: "58.6%" }}
              />
            </div>

            <p className="budget-caption">Sample budget usage: 58.6%</p>

            <div className="budget-item">
              <div className="budget-item-top">
                <span>🍲 Food & groceries</span>
                <span>{money(6200)}</span>
              </div>
              <div className="progress-track">
                <div
                  className="category-fill food-fill"
                  style={{ width: "62%" }}
                />
              </div>
            </div>

            <div className="budget-item">
              <div className="budget-item-top">
                <span>🚗 Transport</span>
                <span>{money(2850)}</span>
              </div>
              <div className="progress-track">
                <div
                  className="category-fill transport-fill"
                  style={{ width: "47.5%" }}
                />
              </div>
            </div>

            <div className="budget-item">
              <div className="budget-item-top">
                <span>📱 Utilities</span>
                <span>{money(2100)}</span>
              </div>
              <div className="progress-track">
                <div
                  className="category-fill utilities-fill"
                  style={{ width: "70%" }}
                />
              </div>
            </div>

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
                        onClick={() =>
                          handleDeleteTransaction(transaction.id)
                        }
                        aria-label={`Delete ${transaction.name}`}
                        title="Delete transaction"
                      >
                        Delete
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
            Demo mode: transactions are shared across pages and saved in this
            browser's local storage. They are not yet connected to a backend
            or cloud database.
          </p>
        </section>

        <section className="panel savings-panel">
          <div className="panel-heading">
            <div>
              <h3>Savings goals</h3>
              <p className="muted">
                We'll build goal tracking in a later step.
              </p>
            </div>
          </div>

          <p className="muted">
            Your savings goals will let you set targets, record contributions,
            and track progress toward what matters to you.
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