"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { resetPassword } from "../../services/api";
import { useUser } from "../../context/UserContext";

export default function ResetPassword() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { logout } = useUser();
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    setToken(value);
    if (!/^[a-f0-9]{64}$/.test(value)) setError("This reset link is invalid. Request a new one.");
    // Remove the secret from the address bar, history and subsequent referrers.
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const submit = async (event) => {
    event.preventDefault(); setError("");
    if (password !== confirmation) { setError("Passwords do not match."); return; }
    setPending(true);
    try { setMessage((await resetPassword(token, password)).message); logout(); }
    catch (err) { setError(err.message); }
    finally { setPending(false); }
  };
  return <div className="auth-shell min-h-screen flex items-center justify-center bg-gray-100">
    <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-md">
      <h2 className="text-2xl font-bold text-center mb-4">Reset password</h2>
      {!message && <form onSubmit={submit}>
        <label htmlFor="new-password" className="block text-gray-700">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} className="w-full p-2 border rounded mt-1 mb-4" value={password} onChange={(event) => setPassword(event.target.value)} />
        <label htmlFor="confirm-password" className="block text-gray-700">Confirm password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} className="w-full p-2 border rounded mt-1 mb-4" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        <button disabled={pending || !/^[a-f0-9]{64}$/.test(token)} className="w-full bg-blue-600 text-white py-2 rounded">{pending ? "Saving..." : "Change password"}</button>
      </form>}
      {message && <p className="success" role="status">{message}</p>}
      {error && <p className="error mt-4" role="alert">{error}</p>}
      <Link href={message ? "/login" : "/forgot-password"} className="auth-link">{message ? "Back to login" : "Request a new reset link"}</Link>
    </div>
  </div>;
}
