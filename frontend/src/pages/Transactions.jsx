import { useMemo, useState } from "react";
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
  }).format(Number(amount) || 0);

function formatDate(dateString) {
  if (!dateString) return "—";

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);

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

  return dateString;
}

function Transactions() {
  const { user } = useAuth();
  const {
    transactions,
    deleteTransaction: removeTransaction,
  } = useTransactions();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  const categories = useMemo(
    () =>
      [...new Set(transactions.map((item) => item.category))]
        .filter(Boolean)
        .sort(),
    [transactions]
  );

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return transactions
      .filter((transaction) => {
        const name = String(transaction.name || "").toLowerCase();
        const category = String(transaction.category || "").toLowerCase();

        const matchesSearch =
          name.includes(query) || category.includes(query);

        const matchesType =
          typeFilter === "all" || transaction.type === typeFilter;

        const matchesCategory =
          categoryFilter === "all" ||
          transaction.category === categoryFilter;

        const transactionDate = transaction.date || "";

        const matchesStartDate =
          !startDate || transactionDate >= startDate;

        const matchesEndDate =
          !endDate || transactionDate <= endDate;

        return (
          matchesSearch &&
          matchesType &&
          matchesCategory &&
          matchesStartDate &&
          matchesEndDate
        );
      })
      .sort((a, b) => {
        const dateA = a.date || "";
        const dateB = b.date || "";

        return sortOrder === "newest"
          ? dateB.localeCompare(dateA)
          : dateA.localeCompare(dateB);
      });
  }, [
    transactions,
    search,
    typeFilter,
    categoryFilter,
    startDate,
    endDate,
    sortOrder,
  ]);

  const filteredIncome = filteredTransactions
    .filter((item) => item.type === "income")
    .reduce((total, item) => total + (Number(item.amount) || 0), 0);

  const filteredExpenses = filteredTransactions
    .filter((item) => item.type === "expense")
    .reduce((total, item) => total + (Number(item.amount) || 0), 0);

  async function handleDeleteTransaction(id) {
    const transaction = transactions.find((item) => item.id === id);

    if (!transaction) return;

    const confirmed = window.confirm(
      `Delete "${transaction.name}"? This cannot be undone.`
    );

    if (confirmed) {
      setDeletingId(id);
      setDeleteError("");

      try {
        await removeTransaction(id);
      } catch (error) {
        console.error("Transaction deletion failed:", error);
        setDeleteError("Could not delete the transaction. Check your connection and try again.");
      } finally {
        setDeletingId(null);
      }
    }
  }

  function resetFilters() {
    setSearch("");
    setTypeFilter("all");
    setCategoryFilter("all");
    setStartDate("");
    setEndDate("");
    setSortOrder("newest");
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
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `nav-link${isActive ? " active" : ""}`
            }
          >
            <span className="nav-icon">⌂</span>
            Dashboard
          </NavLink>

          <NavLink
            to="/transactions"
            className={({ isActive }) =>
              `nav-link${isActive ? " active" : ""}`
            }
          >
            <span className="nav-icon">⇄</span>
            Transactions
          </NavLink>

          <NavLink
            to="/budgets"
            className={({ isActive }) =>
              `nav-link${isActive ? " active" : ""}`
            }
          >
            <span className="nav-icon">▤</span>
            Budgets
          </NavLink>

          <NavLink
            to="/savings"
            className={({ isActive }) =>
              `nav-link${isActive ? " active" : ""}`
            }
          >
            <span className="nav-icon">◎</span>
            Savings
          </NavLink>
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
            Workspace <span>/</span> Transactions
          </div>

          <div className="topbar-right">
            <span className="demo-badge">ACCOUNT DATA</span>
            <div className="avatar small-avatar">
              {[user?.first_name, user?.last_name].filter(Boolean).map((part) => part[0].toUpperCase()).join("") || user?.email?.[0]?.toUpperCase() || "?"}
            </div>
          </div>
        </header>

        <section className="page-heading">
          <div>
            <p className="eyebrow">MONEY ACTIVITY</p>
            <h1>Transactions</h1>
            <p className="muted">
              Search, filter, and review your recorded money movements.
            </p>
          </div>
        </section>

        <section className="summary-grid transaction-summary-grid">
          <article className="summary-card">
            <div className="card-top">
              <span>Matching transactions</span>
              <span className="card-icon balance-icon">⇄</span>
            </div>
            <h2>{filteredTransactions.length}</h2>
            <p className="card-foot">
              <span>Current filters</span>
            </p>
          </article>

          <article className="summary-card">
            <div className="card-top">
              <span>Matching income</span>
              <span className="card-icon income-icon">↙</span>
            </div>
            <h2>{money(filteredIncome)}</h2>
            <p className="card-foot">
              <span>Income in results</span>
            </p>
          </article>

          <article className="summary-card">
            <div className="card-top">
              <span>Matching expenses</span>
              <span className="card-icon expense-icon">↗</span>
            </div>
            <h2>{money(filteredExpenses)}</h2>
            <p className="card-foot">
              <span>Expenses in results</span>
            </p>
          </article>

          <article className="summary-card">
            <div className="card-top">
              <span>Net amount</span>
              <span className="card-icon savings-icon">◈</span>
            </div>
            <h2>{money(filteredIncome - filteredExpenses)}</h2>
            <p className="card-foot">
              <span>Income minus expenses</span>
            </p>
          </article>
        </section>

        <section className="panel transaction-list-panel">
          <div className="panel-heading">
            <div>
              <h3>All transactions</h3>
              <p className="muted">
                Showing {filteredTransactions.length} of{" "}
                {transactions.length} transactions
              </p>
            </div>
          </div>

          <div className="transaction-filters">
            <label className="search-field">
              Search
              <input
                type="search"
                placeholder="Search name or category..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <label>
              Transaction type
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option value="all">All types</option>
                <option value="income">Income</option>
                <option value="expense">Expenses</option>
              </select>
            </label>

            <label>
              Category
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label>
              From date
              <input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>

            <label>
              To date
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>

            <label>
              Sort by date
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>

            <button
              type="button"
              className="period-button reset-filters-button"
              onClick={resetFilters}
            >
              Reset filters
            </button>
          </div>

          {deleteError && (
            <p className="form-error" role="alert">
              {deleteError}
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
                {filteredTransactions.map((transaction) => (
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
                      {money(transaction.amount)}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="delete-button"
                        disabled={deletingId !== null}
                        onClick={() =>
                          handleDeleteTransaction(transaction.id)
                        }
                        aria-label={`Delete ${transaction.name}`}
                      >
                        {String(deletingId) === String(transaction.id)
                          ? "Deleting..."
                          : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty-state">
                      No transactions match your filters. Try changing your
                      search or resetting the filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="demo-note">
            Transactions sync with your account and are available across your
            signed-in pages.
          </p>
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

export default Transactions;
