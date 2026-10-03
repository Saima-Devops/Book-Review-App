"use client";
import { createContext, useContext, useState, useEffect } from "react";

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const restore = () => {
      try {
        const token = localStorage.getItem("token");
        const storedUser = localStorage.getItem("user");
        const expiry = token ? JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp : 0;
        if (storedUser && expiry * 1000 > Date.now()) setUser(JSON.parse(storedUser));
        else { localStorage.removeItem("token"); localStorage.removeItem("user"); setUser(null); }
      } catch { localStorage.removeItem("token"); localStorage.removeItem("user"); setUser(null); }
    };
    restore();
    window.addEventListener("storage", restore);
    return () => window.removeEventListener("storage", restore);
  }, []);

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem("token");
    const expiry = token ? JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp : 0;
    const timer = setTimeout(() => {
      localStorage.removeItem("token"); localStorage.removeItem("user"); setUser(null);
    }, Math.max(0, expiry * 1000 - Date.now()));
    return () => clearTimeout(timer);
  }, [user]);

  const login = (token, userData) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  return (
    <UserContext.Provider value={{ user, login, logout }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
