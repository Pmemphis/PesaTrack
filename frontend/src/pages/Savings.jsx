
import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import "../App.css";
import { useTransactions } from "../context/TransactionContext";
import AccountPanel from "../components/AccountPanel";
import { useAuth } from "../context/useAuth";

const GOAL_CATEGORIES = [
  { label: "Emergency fund", icon: "🛟" },
  { label: "Personal", icon: "🎯" },
  { label: "Education", icon: "📚" },
  { label: "Business", icon: "💼" },
  { label: "Phone or electronics", icon: "📱" },
  { label: "Transport", icon: "🏍️" },
  { label: "Home", icon: "🏠" },
  { label: "Other", icon: "🐷" },
];

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "No date";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getGoalBalance(goal) {
  return (goal.contributions || []).reduce((balance, contribution) => {
    const amount = Number(contribution.amount) || 0;

    return contribution.type === "withdrawal"
      ? balance - amount
      : balance + amount;
  }, 0);
}

function getGoalIcon(category) {
  return (
    GOAL_CATEGORIES.find((item) => item.label === category)?.icon || "🐷"
  );
}

function userInitials(user) {
  return [user?.first_name, user?.last_name]
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .join("") || user?.email?.[0]?.toUpperCase() || "?";
}

function Savings() {
  const { user } = useAuth();
  const {
    savingsGoals = [],
    legacySavingsGoals = [],
    saveSavingsGoal,
    addSavingsContribution,
    deleteSavingsGoal,
    importLegacySavingsGoals,
    isLoadingSavingsGoals,
    savingsError,
  } = useTransactions();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("Personal");
  const [targetAmount, setTargetAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [deletingGoalId, setDeletingGoalId] = useState(null);
  const [isImportingLegacyGoals, setIsImportingLegacyGoals] = useState(false);
  const [legacyImportError, setLegacyImportError] = useState("");

  const [selectedGoalId, setSelectedGoalId] = useState(null);
  const [contributionType, setContributionType] = useState("deposit");
  const [contributionAmount, setContributionAmount] = useState("");
  const [contributionDate, setContributionDate] = useState(todayString());
  const [contributionNote, setContributionNote] = useState("");
  const [contributionError, setContributionError] = useState("");
  const [isSavingContribution, setIsSavingContribution] = useState(false);

  const [historyGoalId, setHistoryGoalId] = useState(null);

  const goalSummaries = useMemo(() => {
    return savingsGoals.map((goal) => {
      const balance = getGoalBalance(goal);
      const target = Number(goal.targetAmount) || 0;

      return {
        ...goal,
        balance,
        target,
        remaining: target - balance,
        progress: target > 0 ? (balance / target) * 100 : 0,
      };
    });
  }, [savingsGoals]);

  const totalSaved = goalSummaries.reduce(
    (total, goal) => total + goal.balance,
    0
  );

  const totalTargets = goalSummaries.reduce(
    (total, goal) => total + goal.target,
    0
  );

  const completedGoals = goalSummaries.filter(
    (goal) => goal.target > 0 && goal.balance >= goal.target
  ).length;

  const selectedGoal = savingsGoals.find(
    (goal) => goal.id === selectedGoalId
  );

  const historyGoal = savingsGoals.find(
    (goal) => goal.id === historyGoalId
  );

  function resetGoalForm() {
    setName("");
    setCategory("Personal");
    setTargetAmount("");
    setDeadline("");
    setDescription("");
    setEditingId(null);
    setFormError("");
  }

  async function handleSaveGoal(event) {
    event.preventDefault();
    setFormError("");

    const cleanName = name.trim();
    const numericTarget = Number(targetAmount);

    if (!cleanName) {
      setFormError("Please enter a name for your savings goal.");
      return;
    }

    if (cleanName.length > 80) {
      setFormError("Goal name must be 80 characters or fewer.");
      return;
    }

    if (!Number.isFinite(numericTarget) || numericTarget <= 0) {
      setFormError("Enter a target amount greater than zero.");
      return;
    }

    if (deadline && deadline < todayString() && !editingId) {
      setFormError("Choose today or a future date for your deadline.");
      return;
    }

    setIsSavingGoal(true);

    try {
      await saveSavingsGoal({
        id: editingId ?? undefined,
        name: cleanName,
        category,
        targetAmount: numericTarget,
        deadline,
        description: description.trim(),
      });

      resetGoalForm();
    } catch (error) {
      console.error("Savings goal save failed:", error);
      setFormError("Could not save this goal. Check your connection and try again.");
    } finally {
      setIsSavingGoal(false);
    }
  }

  function handleEditGoal(goal) {
    setName(goal.name);
    setCategory(goal.category || "Personal");
    setTargetAmount(String(goal.targetAmount));
    setDeadline(goal.deadline || "");
    setDescription(goal.description || "");
    setEditingId(goal.id);
    setFormError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function handleDeleteGoal(goal) {
    const confirmed = window.confirm(
      `Delete "${goal.name}" and its contribution history? This action cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingGoalId(goal.id);
    setActionError("");

    try {
      await deleteSavingsGoal(goal.id);

      if (String(editingId) === String(goal.id)) {
        resetGoalForm();
      }

      if (String(selectedGoalId) === String(goal.id)) {
        setSelectedGoalId(null);
      }

      if (String(historyGoalId) === String(goal.id)) {
        setHistoryGoalId(null);
      }
    } catch (error) {
      console.error("Savings goal deletion failed:", error);
      setActionError("Could not delete this goal. Check your connection and try again.");
    } finally {
      setDeletingGoalId(null);
    }
  }

  function openContributionForm(goalId, type) {
    setSelectedGoalId(goalId);
    setContributionType(type);
    setContributionAmount("");
    setContributionDate(todayString());
    setContributionNote("");
    setContributionError("");
  }

  function closeContributionForm() {
    setSelectedGoalId(null);
    setContributionAmount("");
    setContributionNote("");
    setContributionError("");
  }

  async function handleImportLegacyGoals() {
    const confirmed = window.confirm(
      `Import ${legacySavingsGoals.length} older savings goal${
        legacySavingsGoals.length === 1 ? "" : "s"
      } and all contribution history into the account you are signed in to?`
    );

    if (!confirmed) return;

    setIsImportingLegacyGoals(true);
    setLegacyImportError("");

    try {
      await importLegacySavingsGoals();
    } catch (error) {
      console.error("Legacy savings import failed:", error);
      setLegacyImportError(
        "Import did not finish. Your browser copy is still saved; check your connection and retry."
      );
    } finally {
      setIsImportingLegacyGoals(false);
    }
  }

  async function handleContributionSubmit(event) {
    event.preventDefault();
    setContributionError("");

    const numericAmount = Number(contributionAmount);

    if (!selectedGoal) {
      setContributionError("Please select a valid savings goal.");
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setContributionError("Enter an amount greater than zero.");
      return;
    }

    if (!contributionDate || contributionDate > todayString()) {
      setContributionError("Choose today or an earlier date.");
      return;
    }

    const currentBalance = getGoalBalance(selectedGoal);

    if (
      contributionType === "withdrawal" &&
      numericAmount > currentBalance
    ) {
      setContributionError(
        `You cannot withdraw more than the available balance of ${formatMoney(
          currentBalance
        )}.`
      );
      return;
    }

    setIsSavingContribution(true);

    try {
      await addSavingsContribution(selectedGoal.id, {
        type: contributionType,
        amount: numericAmount,
        date: contributionDate,
        note: contributionNote.trim(),
      });

      closeContributionForm();
    } catch (error) {
      console.error("Savings contribution save failed:", error);
      setContributionError(
        "Could not save this contribution. Check your connection and try again."
      );
    } finally {
      setIsSavingContribution(false);
    }
  }

  return (
    <div className="app-shell savings-page">
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
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            <span className="nav-icon">⌂</span> Dashboard
          </NavLink>

          <NavLink
            to="/transactions"
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            <span className="nav-icon">⇄</span> Transactions
          </NavLink>

          <NavLink
            to="/budgets"
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            <span className="nav-icon">▤</span> Budgets
          </NavLink>

          <NavLink
            to="/savings"
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            <span className="nav-icon">◎</span> Savings
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
            Workspace <span>/</span> Savings
          </div>
          <div className="topbar-right">
            <span className="demo-badge">ACCOUNT DATA</span>
            <div className="avatar small-avatar">{userInitials(user)}</div>
          </div>
        </header>

        <section className="page-heading">
          <div>
            <p className="eyebrow">BUILD YOUR FUTURE</p>
            <h1>Savings Goals</h1>
            <p className="muted">
              Turn your plans into goals and track every contribution.
            </p>
          </div>

          <a
            className="primary-button"
            href="#create-savings-goal"
          >
            <span>＋</span> New goal
          </a>
        </section>

        <section className="summary-grid savings-summary-grid">
          <article className="summary-card">
            <div className="card-top">
              <span>Total saved</span>
              <span className="card-icon savings-icon">🐷</span>
            </div>
            <h2>{formatMoney(totalSaved)}</h2>
            <p>Across all active and completed goals</p>
          </article>

          <article className="summary-card">
            <div className="card-top">
              <span>Total targets</span>
              <span className="card-icon balance-icon">🎯</span>
            </div>
            <h2>{formatMoney(totalTargets)}</h2>
            <p>Combined goal amounts</p>
          </article>

          <article className="summary-card">
            <div className="card-top">
              <span>Goals completed</span>
              <span className="card-icon income-icon">🏆</span>
            </div>
            <h2>
              {completedGoals} / {savingsGoals.length}
            </h2>
            <p>Goals that have reached their target</p>
          </article>

          <article className="summary-card">
            <div className="card-top">
              <span>Still needed</span>
              <span className="card-icon expense-icon">📈</span>
            </div>
            <h2>
              {formatMoney(
                goalSummaries.reduce(
                  (total, goal) => total + Math.max(0, goal.remaining),
                  0
                )
              )}
            </h2>
            <p>Amount remaining to reach your targets</p>
          </article>
        </section>

        <section className="savings-layout">
          <div
            className="panel savings-form-panel"
            id="create-savings-goal"
          >
            <div className="panel-heading savings-panel-heading">
              <div>
                <h2>{editingId ? "Edit savings goal" : "Create a goal"}</h2>
                <p>
                  {editingId
                    ? "Update the details of your goal."
                    : "Give your next financial milestone a name."}
                </p>
              </div>
              <span className="panel-icon">✨</span>
            </div>

            <form className="savings-form" onSubmit={handleSaveGoal}>
              <div className="form-group">
                <label htmlFor="savings-name">Goal name</label>
                <input
                  id="savings-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. New laptop"
                  maxLength={80}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="savings-category">Goal category</label>
                <select
                  id="savings-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {GOAL_CATEGORIES.map((item) => (
                    <option key={item.label} value={item.label}>
                      {item.icon} {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="savings-target">Target amount (KES)</label>
                <input
                  id="savings-target"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={targetAmount}
                  onChange={(event) =>
                    setTargetAmount(event.target.value)
                  }
                  placeholder="e.g. 30000"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="savings-deadline">
                  Target date (optional)
                </label>
                <input
                  id="savings-deadline"
                  type="date"
                  min={editingId ? undefined : todayString()}
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="savings-description">
                  Notes (optional)
                </label>
                <textarea
                  id="savings-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Why is this goal important to you?"
                  rows={3}
                  maxLength={300}
                />
              </div>

              {formError && (
                <p className="savings-error" role="alert">
                  {formError}
                </p>
              )}

              <div className="savings-form-actions">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isSavingGoal}
                >
                  {isSavingGoal
                    ? "Saving..."
                    : editingId
                    ? "Save changes"
                    : "Create goal"}
                </button>

                {editingId && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={resetGoalForm}
                    disabled={isSavingGoal}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="panel savings-goals-panel">
            <div className="panel-heading savings-panel-heading">
              <div>
                <h2>Your savings goals</h2>
                <p>Keep moving toward what matters to you.</p>
              </div>

              <span className="budget-count">
                {savingsGoals.length}{" "}
                {savingsGoals.length === 1 ? "goal" : "goals"}
              </span>
            </div>

            {actionError && (
              <p className="savings-error" role="alert">
                {actionError}
              </p>
            )}

            {isLoadingSavingsGoals ? (
              <div className="budget-empty-state">
                <div className="empty-state-icon">⏳</div>
                <h3>Loading savings goals...</h3>
                <p>Fetching your goals and contribution history.</p>
              </div>
            ) : savingsError ? (
              <div className="budget-empty-state">
                <div className="empty-state-icon">⚠️</div>
                <h3>Could not load savings goals</h3>
                <p>Check your connection and refresh the page.</p>
              </div>
            ) : goalSummaries.length === 0 ? (
              <div className="budget-empty-state">
                <div className="empty-state-icon">🐷</div>
                <h3>Your first goal starts here</h3>
                <p>
                  Create a savings goal, set a target, and record your
                  first deposit when you are ready.
                </p>
              </div>
            ) : (
              <div className="savings-goals-list">
                {goalSummaries.map((goal) => {
                  const isComplete =
                    goal.target > 0 && goal.balance >= goal.target;

                  const progress = Math.max(
                    0,
                    Math.min(100, goal.progress)
                  );

                  return (
                    <article className="savings-goal-card" key={goal.id}>
                      <div className="savings-goal-heading">
                        <div className="savings-goal-identity">
                          <div className="savings-goal-icon">
                            {getGoalIcon(goal.category)}
                          </div>

                          <div>
                            <h3>{goal.name}</h3>
                            <p>{goal.category || "Personal"}</p>
                          </div>
                        </div>

                        <span
                          className={`savings-status ${
                            isComplete ? "complete" : "active"
                          }`}
                        >
                          {isComplete ? "Completed" : "In progress"}
                        </span>
                      </div>

                      <div className="savings-balance-row">
                        <div>
                          <span className="savings-muted-label">
                            Saved so far
                          </span>
                          <strong className="savings-balance">
                            {formatMoney(goal.balance)}
                          </strong>
                        </div>

                        <div className="savings-target">
                          <span className="savings-muted-label">
                            Target
                          </span>
                          <strong>{formatMoney(goal.target)}</strong>
                        </div>
                      </div>

                      <div
                        className="budget-progress-track savings-progress-track"
                        role="progressbar"
                        aria-label={`${goal.name} savings progress`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(progress)}
                      >
                        <div
                          className={`budget-progress-fill ${
                            isComplete ? "good" : "savings-progress-fill"
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>

                      <div className="savings-progress-footer">
                        <span>{Math.round(goal.progress)}% reached</span>

                        <strong>
                          {goal.remaining <= 0
                            ? "Target reached!"
                            : `${formatMoney(goal.remaining)} to go`}
                        </strong>
                      </div>

                      {goal.deadline && (
                        <p className="savings-deadline">
                          <span>📅</span>
                          Target date: {formatDate(goal.deadline)}
                        </p>
                      )}

                      {goal.description && (
                        <p className="savings-description">
                          {goal.description}
                        </p>
                      )}

                      <div className="savings-goal-actions">
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() =>
                            openContributionForm(goal.id, "deposit")
                          }
                        >
                          + Deposit
                        </button>

                        <button
                          type="button"
                          className="secondary-button"
                          disabled={goal.balance <= 0}
                          onClick={() =>
                            openContributionForm(goal.id, "withdrawal")
                          }
                        >
                          Withdraw
                        </button>

                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setHistoryGoalId(goal.id)}
                        >
                          History
                        </button>

                        <button
                          type="button"
                          className="text-button"
                          onClick={() => handleEditGoal(goal)}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="text-button delete-text-button"
                          onClick={() => handleDeleteGoal(goal)}
                          disabled={deletingGoalId !== null}
                        >
                          {String(deletingGoalId) === String(goal.id)
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

        {legacySavingsGoals.length > 0 && (
          <section className="panel legacy-savings-import">
            <div>
              <h2>Older browser savings data</h2>
              <p>
                {legacySavingsGoals.length} goal
                {legacySavingsGoals.length === 1 ? " is" : "s are"} still saved
                in this browser. Importing moves them and their contribution
                history into the account you are signed in to. The browser copy
                stays in place unless the import finishes successfully.
              </p>
              {legacyImportError && (
                <p className="savings-error" role="alert">
                  {legacyImportError}
                </p>
              )}
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={handleImportLegacyGoals}
              disabled={
                isImportingLegacyGoals ||
                isLoadingSavingsGoals ||
                Boolean(savingsError)
              }
            >
              {isImportingLegacyGoals
                ? "Importing..."
                : "Import into this account"}
            </button>
          </section>
        )}

        {selectedGoal && (
          <div
            className="savings-modal-backdrop"
            onMouseDown={(event) => {
              if (
                !isSavingContribution &&
                event.target === event.currentTarget
              ) {
                closeContributionForm();
              }
            }}
          >
            <section
              className="panel savings-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="contribution-title"
            >
              <div className="panel-header">
                <div>
                  <h2 id="contribution-title">
                    {contributionType === "deposit"
                      ? "Record a deposit"
                      : "Record a withdrawal"}
                  </h2>
                  <p>{selectedGoal.name}</p>
                </div>

                <button
                  type="button"
                  className="savings-modal-close"
                  onClick={closeContributionForm}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <p className="savings-available-balance">
                Available balance:{" "}
                <strong>
                  {formatMoney(getGoalBalance(selectedGoal))}
                </strong>
              </p>

              <form
                className="savings-form"
                onSubmit={handleContributionSubmit}
              >
                <div className="form-group">
                  <label htmlFor="contribution-amount">
                    Amount (KES)
                  </label>
                  <input
                    id="contribution-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={contributionAmount}
                    onChange={(event) =>
                      setContributionAmount(event.target.value)
                    }
                    placeholder="e.g. 1000"
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="contribution-date">Date</label>
                  <input
                    id="contribution-date"
                    type="date"
                    max={todayString()}
                    value={contributionDate}
                    onChange={(event) =>
                      setContributionDate(event.target.value)
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="contribution-note">
                    Note (optional)
                  </label>
                  <input
                    id="contribution-note"
                    type="text"
                    maxLength={150}
                    value={contributionNote}
                    onChange={(event) =>
                      setContributionNote(event.target.value)
                    }
                    placeholder={
                      contributionType === "deposit"
                        ? "e.g. Weekly savings"
                        : "e.g. Emergency expense"
                    }
                  />
                </div>

                {contributionError && (
                  <p className="savings-error" role="alert">
                    {contributionError}
                  </p>
                )}

                <div className="savings-form-actions">
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={isSavingContribution}
                  >
                    {isSavingContribution
                      ? "Saving..."
                      : `Confirm ${contributionType === "deposit" ? "deposit" : "withdrawal"}`}
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={closeContributionForm}
                    disabled={isSavingContribution}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {historyGoal && (
          <div className="savings-modal-backdrop">
            <section
              className="panel savings-modal savings-history-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="savings-history-title"
            >
              <div className="panel-header">
                <div>
                  <h2 id="savings-history-title">Contribution history</h2>
                  <p>{historyGoal.name}</p>
                </div>

                <button
                  type="button"
                  className="savings-modal-close"
                  onClick={() => setHistoryGoalId(null)}
                  aria-label="Close history"
                >
                  ×
                </button>
              </div>

              <p className="savings-available-balance">
                Current balance:{" "}
                <strong>
                  {formatMoney(getGoalBalance(historyGoal))}
                </strong>
              </p>

              {(historyGoal.contributions || []).length === 0 ? (
                <div className="budget-empty-state">
                  <div className="empty-state-icon">🧾</div>
                  <h3>No contributions yet</h3>
                  <p>
                    Deposits and withdrawals for this goal will appear here.
                  </p>
                </div>
              ) : (
                <div className="savings-history-list">
                  {[...(historyGoal.contributions || [])]
                    .sort((a, b) => {
                      const dateOrder = b.date.localeCompare(a.date);

                      return dateOrder || Number(b.id) - Number(a.id);
                    })
                    .map((contribution) => (
                      <article
                        className="savings-history-item"
                        key={contribution.id}
                      >
                        <div className="savings-history-icon">
                          {contribution.type === "withdrawal"
                            ? "↗"
                            : "↙"}
                        </div>

                        <div className="savings-history-details">
                          <strong>
                            {contribution.type === "withdrawal"
                              ? "Withdrawal"
                              : "Deposit"}
                          </strong>
                          <span>{formatDate(contribution.date)}</span>

                          {contribution.note && (
                            <p>{contribution.note}</p>
                          )}
                        </div>

                        <strong
                          className={
                            contribution.type === "withdrawal"
                              ? "savings-withdrawal-amount"
                              : "savings-deposit-amount"
                          }
                        >
                          {contribution.type === "withdrawal" ? "−" : "+"}
                          {formatMoney(contribution.amount)}
                        </strong>
                      </article>
                    ))}
                </div>
              )}

              <div className="savings-form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setHistoryGoalId(null)}
                >
                  Close history
                </button>
              </div>
            </section>
          </div>
        )}

        <section className="panel budget-tip-panel">
          <div className="budget-tip-icon">💡</div>
          <div>
            <h3>Make saving a habit</h3>
            <p>
              Set a realistic target, contribute consistently, and use
              withdrawals only when necessary. Every contribution helps
              you measure progress toward your goal.
            </p>
          </div>
        </section>

        <footer className="footer">
          <span>PesaTrack · Personal Finance</span>
          <span>Savings goals and contributions sync with your account</span>
        </footer>
      </main>
    </div>
  );
}

export default Savings;
