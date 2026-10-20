import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api";
import "../App.css";

export default function OAuthCallback() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get("token");
  const linkCode = params.get("link_code");
  const provider = params.get("provider");
  const errorCode = params.get("error");
  const [callbackError, setCallbackError] = useState("");
  const hasError = (!token && !linkCode) || Boolean(errorCode) || Boolean(callbackError);
  const errorMessage =
    callbackError || (errorCode === "account_exists"
      ? "This email already belongs to a PesaTrack account. Sign in with your email and password, then connect this provider from your account panel."
      : errorCode === "identity_conflict"
        ? "This provider is already connected to a different PesaTrack account. Sign in to the account it is connected to."
        : "Social sign-in did not complete. Please try again.");

  useEffect(() => {
    if (token) {
      localStorage.setItem("pesatrack_token", token);
      window.history.replaceState(null, "", "/auth/callback");
      window.dispatchEvent(new Event("pesatrack-auth-change"));
      navigate("/", { replace: true });
      return;
    }

    if (linkCode && ["google", "github"].includes(provider)) {
      window.history.replaceState(null, "", "/auth/callback");
      apiRequest(`/auth/${provider}/link/complete/`, {
        method: "POST",
        body: JSON.stringify({ code: linkCode }),
      })
        .then(() => {
          window.dispatchEvent(new Event("pesatrack-auth-change"));
          navigate("/", { replace: true });
        })
        .catch((error) => {
          setCallbackError(error.message || "Could not connect this provider.");
        });
      return;
    }

    window.history.replaceState(null, "", "/auth/callback");
  }, [linkCode, navigate, provider, token]);

  return (
    <main className="login-page">
      <section className="panel login-panel" aria-live="polite">
        <h1>{hasError ? "Sign-in failed" : linkCode ? "Connecting account" : "Signing you in"}</h1>
        <p>{hasError ? errorMessage : linkCode ? "Please wait while we connect this provider." : "Please wait while we finish signing in."}</p>
        {hasError && <a className="callback-login-link" href="/login">Return to sign in</a>}
      </section>
    </main>
  );
}
