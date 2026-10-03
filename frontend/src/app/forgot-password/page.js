"use client";
import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "../../services/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setPending(true); setMessage(""); setError("");
    try { setMessage((await requestPasswordReset(email)).message); }
    catch (err) { setError(err.message); }
    finally { setPending(false); }
  };
  return <div className="auth-shell min-h-screen flex items-center justify-center bg-gray-100">
    <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-md">
      <h2 className="text-2xl font-bold text-center mb-4">Forgot password</h2>
      <form onSubmit={submit}>
        <label htmlFor="recovery-email" className="block text-gray-700">Email</label>
        <input id="recovery-email" type="email" autoComplete="email" maxLength={254} required className="w-full p-2 border rounded mt-1 mb-4" value={email} onChange={(event) => setEmail(event.target.value)} />
        <button disabled={pending} className="w-full bg-blue-600 text-white py-2 rounded">{pending ? "Sending..." : "Send reset link"}</button>
      </form>
      {message && <p className="success mt-4" role="status">{message}</p>}
      {error && <p className="error mt-4" role="alert">{error}</p>}
      <Link href="/login" className="auth-link">Back to login</Link>
    </div>
  </div>;
}
