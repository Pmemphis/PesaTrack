
const API_ORIGIN = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
export const API_BASE_URL = `${API_ORIGIN.replace(/\/+$/, "")}/api`;

function apiErrorMessage(data, fallback) {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.map((item) => apiErrorMessage(item, "")).filter(Boolean).join(" ");
  if (data && typeof data === "object") {
    if (typeof data.detail === "string") return data.detail;
    return Object.values(data).map((item) => apiErrorMessage(item, "")).filter(Boolean).join(" ");
  }
  return fallback;
}

export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem("pesatrack_token");

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Token ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(apiErrorMessage(data, `API request failed: ${response.status}`));
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function login(username, password) {
  const response = await fetch(`${API_BASE_URL}/token/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error("Login failed. Check your username and password.");
  }

  const data = await response.json();
  localStorage.setItem("pesatrack_token", data.token);
  window.dispatchEvent(new Event("pesatrack-auth-change"));
  return data;
}

export async function register(name, email, password) {
  const response = await fetch(`${API_BASE_URL}/register/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = Object.values(data).flat().join(" ");
    throw new Error(message || "Could not create your account.");
  }

  return response.json();
}

export async function getOAuthProviders() {
  const response = await fetch(`${API_BASE_URL}/auth/providers/`);
  if (!response.ok) throw new Error("Could not check social sign-in options.");
  return response.json();
}

export async function logout() {
  try {
    await apiRequest("/logout/", { method: "POST" });
  } finally {
    localStorage.removeItem("pesatrack_token");
    window.dispatchEvent(new Event("pesatrack-auth-change"));
  }
}
