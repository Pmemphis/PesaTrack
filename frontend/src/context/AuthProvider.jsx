import { useEffect, useState } from "react";
import { apiRequest } from "../api";
import AuthContext from "./authContext";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const token = localStorage.getItem("pesatrack_token");
      if (!token) {
        if (active) setUser(null);
        return;
      }

      try {
        const profile = await apiRequest("/me/");
        if (active && localStorage.getItem("pesatrack_token") === token) {
          setUser(profile);
        }
      } catch (error) {
        console.error("Could not load your account profile:", error);
        if (active) setUser(null);
      }
    }

    function handleAuthChange() {
      loadUser();
    }

    loadUser();
    window.addEventListener("pesatrack-auth-change", handleAuthChange);
    return () => {
      active = false;
      window.removeEventListener("pesatrack-auth-change", handleAuthChange);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user }}>
      {children}
    </AuthContext.Provider>
  );
}
