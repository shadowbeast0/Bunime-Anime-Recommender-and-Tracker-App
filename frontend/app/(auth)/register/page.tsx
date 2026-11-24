"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import AuthShell from "@/components/features/AuthShell";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await api.register({ username, email, password });
      await api.login(username, password);
      router.push("/dashboard/");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell headline="Every series you’ve watched, on one shelf.">
      <div><h2>Create account</h2><p className="help">A watchlist that actually feels like yours.</p></div>
      {error && <div className="notice" role="alert">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field"><label htmlFor="username">Username</label><input id="username" autoComplete="username" minLength={3} value={username} onChange={(event) => setUsername(event.target.value)} required /></div>
        <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
        <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="new-password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
        <button type="submit" className="btn btn-hot" disabled={isLoading}>{isLoading ? <Loader2 size={18} className="spin" /> : "Create account"}</button>
      </form>
      <p className="auth-foot">Already have an account? <Link href="/login/">Sign in</Link></p>
    </AuthShell>
  );
}
