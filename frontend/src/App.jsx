
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Budgets from "./pages/Budgets";
import Savings from "./pages/Savings";
import Login from "./pages/Login";
import OAuthCallback from "./pages/OAuthCallback";
import { AuthProvider } from "./context/AuthProvider";

import { TransactionProvider } from "./context/TransactionContext";

import "./App.css";

// Redirect users to login when they have no stored API token.
function ProtectedRoute({ children }) {
  const token = localStorage.getItem("pesatrack_token");

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
  return (
    <BrowserRouter>
      <TransactionProvider>
        <AuthProvider>
        <Routes>
          {/* Public login page */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Login isSignup />} />
          <Route path="/auth/callback" element={<OAuthCallback />} />

          {/* Protected application pages */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/transactions"
            element={
              <ProtectedRoute>
                <Transactions />
              </ProtectedRoute>
            }
          />

          <Route
            path="/budgets"
            element={
              <ProtectedRoute>
                <Budgets />
              </ProtectedRoute>
            }
          />

          <Route
            path="/savings"
            element={
              <ProtectedRoute>
                <Savings />
              </ProtectedRoute>
            }
          />

          {/* Redirect unknown routes */}
          <Route
            path="*"
            element={<Navigate to="/" replace />}
          />
        </Routes>
        </AuthProvider>
      </TransactionProvider>
    </BrowserRouter>
  );
}

export default App;
