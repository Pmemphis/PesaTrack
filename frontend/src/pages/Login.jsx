
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { API_BASE_URL, getOAuthProviders, login, register } from "../api";
import "../App.css";

export default function Login({ isSignup = false }) {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState({ google: false, github: false });

  useEffect(() => {
    getOAuthProviders()
      .then(setProviders)
      .catch((providerError) => {
        console.error("Could not load social sign-in options:", providerError);
      });
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignup) {
        await register(name.trim(), username.trim(), password);
      }
      await login(username.trim(), password);
      navigate("/");
    } catch (err) {
      setError(err.message || "Unable to log in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <form className="panel login-panel" onSubmit={handleSubmit}>
        <h1>{isSignup ? "Create your account" : "Welcome to PesaTrack"}</h1>
        <p>{isSignup ? "Start managing your money with PesaTrack." : "Sign in to manage your finances."}</p>

        {error && <p role="alert" className="login-error">{error}</p>}

        {isSignup && (
          <>
            <label htmlFor="name">Full name</label>
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
            />
          </>
        )}

        <label htmlFor="username">{isSignup ? "Email" : "Email or username"}</label>
        <input
          id="username"
          type={isSignup ? "email" : "text"}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete={isSignup ? "email" : "username"}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={isSignup ? "new-password" : "current-password"}
          minLength={isSignup ? 8 : undefined}
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? "Please wait..." : isSignup ? "Create account" : "Sign in"}
        </button>
        <div className="auth-divider"><span>or continue with</span></div>
        <div className="social-auth-buttons">
          {[
            ["google", "Google"],
            ["github", "GitHub"],
          ].map(([provider, label]) => (
            <a
              key={provider}
              className={`social-auth-button${providers[provider] ? "" : " unavailable"}`}
              href={providers[provider] ? `${API_BASE_URL}/auth/${provider}/` : undefined}
              aria-disabled={!providers[provider]}
              title={providers[provider] ? `Continue with ${label}` : `Set ${provider.toUpperCase()}_CLIENT_ID and ${provider.toUpperCase()}_CLIENT_SECRET to enable`}
            >
              {label}
              {!providers[provider] && <small>Setup needed</small>}
            </a>
          ))}
        </div>
        <p className="auth-switch">
          {isSignup ? "Already have an account? " : "New to PesaTrack? "}
          <Link to={isSignup ? "/login" : "/signup"}>
            {isSignup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </form>
    </main>
  );
}
