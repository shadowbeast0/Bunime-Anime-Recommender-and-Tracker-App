"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import AuthShell from "@/components/features/AuthShell";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await api.login(username, password);
      router.push("/dashboard/");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Invalid username or password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell headline="Okaeri. Your list is right where you left it.">
      <div><h2>Sign in</h2><p className="help">Pick up right where your story left off.</p></div>
      {error && <div className="notice" role="alert">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field"><label htmlFor="username">Username</label><input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></div>
        <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
        <button type="submit" className="btn btn-hot" disabled={isLoading}>{isLoading ? <Loader2 size={18} className="spin" /> : "Sign in"}</button>
      </form>
      <p className="auth-foot">New here? <Link href="/register/">Create an account</Link></p>
    </AuthShell>
  );
}
