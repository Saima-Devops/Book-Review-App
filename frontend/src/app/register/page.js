"use client";
import { useState } from "react";
import { registerUser } from "../../services/api";
import { useRouter } from "next/navigation";
import ConfirmationDialog from "../../components/ConfirmationDialog";

export default function Register() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [pending, setPending] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pending || registered) return;
    setError(null);
    setPending(true);

    try {
      await registerUser({ name, username, email, password });
      setRegistered(true);
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="auth-shell min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold text-center mb-4">Register</h2>
        {error && <p className="text-red-500 text-center">{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="register-username" className="block text-gray-700">Username</label>
            <input id="register-username" autoComplete="username" className="w-full p-2 border rounded mt-1" value={username} onChange={(e) => setUsername(e.target.value)} pattern="[a-zA-Z0-9_.-]{3,32}" minLength={3} maxLength={32} required />
          </div>
          <div className="mb-4">
            <label htmlFor="register-name" className="block text-gray-700">Full Name</label>
            <input
              type="text"
              id="register-name"
              maxLength={255}
              autoComplete="name"
              className="w-full p-2 border rounded mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="register-email" className="block text-gray-700">Email</label>
            <input
              type="email"
              id="register-email"
              maxLength={254}
              autoComplete="email"
              className="w-full p-2 border rounded mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="register-password" className="block text-gray-700">Password</label>
            <input
              type="password"
              id="register-password"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              className="w-full p-2 border rounded mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button disabled={pending || registered} className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700">
            {pending ? "Registering..." : "Register"}
          </button>
        </form>
      </div>
      <ConfirmationDialog open={registered} title="Welcome to Book Shelf!" message="Your account is ready. Log in to start your next chapter." confirmLabel="Go to login" onConfirm={() => router.push("/login")} />
    </div>
  );
}
