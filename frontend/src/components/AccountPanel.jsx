import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest, getOAuthProviders, logout } from "../api";
import { useAuth } from "../context/useAuth";

function getDisplayName(user) {
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ");
  return fullName || user?.email || user?.username || "My account";
}

export default function AccountPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [linkingProvider, setLinkingProvider] = useState("");
  const [linkError, setLinkError] = useState("");
  const [availableProviders, setAvailableProviders] = useState({});
  const name = getDisplayName(user);
  const linkedProviders = user?.social_providers || [];
  const initials = name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  useEffect(() => {
    getOAuthProviders()
      .then(setAvailableProviders)
      .catch((error) => console.error("Could not load social sign-in options:", error));
  }, []);

  async function handleLinkProvider(provider) {
    setLinkError("");
    setLinkingProvider(provider);
    try {
      const result = await apiRequest(`/auth/${provider}/link/`, { method: "POST" });
      window.location.assign(result.authorization_url);
    } catch (error) {
      setLinkError(error.message || `Could not connect ${provider}.`);
      setLinkingProvider("");
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      console.error("Server logout failed; local sign-in was cleared:", error);
    } finally {
      navigate("/login", { replace: true });
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="profile account-panel">
      <div className="avatar" aria-hidden="true">{initials || "?"}</div>
      <div className="account-details">
        <strong>{name}</strong>
        <span>{user?.email || user?.username || "Signed-in account"}</span>
      </div>
      <button
        type="button"
        className="logout-button"
        onClick={handleLogout}
        disabled={isLoggingOut}
      >
        {isLoggingOut ? "..." : "Log out"}
      </button>
      {(linkedProviders.length > 0 || Object.values(availableProviders).some(Boolean)) && (
        <div className="account-link-actions">
          {linkedProviders.map((provider) => (
            <span className="linked-provider" key={provider}>
              {provider === "github" ? "GitHub" : "Google"} connected
            </span>
          ))}
          {Object.entries(availableProviders)
            .filter(([provider, enabled]) => enabled && !linkedProviders.includes(provider))
            .map(([provider]) => (
              <button
                className="account-link-button"
                key={provider}
                type="button"
                disabled={Boolean(linkingProvider)}
                onClick={() => handleLinkProvider(provider)}
              >
                {linkingProvider === provider
                  ? "Connecting..."
                  : `Connect ${provider === "github" ? "GitHub" : "Google"}`}
              </button>
            ))}
        </div>
      )}
      {linkError && <span className="account-link-error" role="alert">{linkError}</span>}
    </div>
  );
}
