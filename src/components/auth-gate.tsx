"use client";

import { useState } from "react";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { DataProvider } from "@/components/data-provider";
import { AppShell } from "@/components/app-shell";

function AuthScreen() {
  const { demoMode, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const error = mode === "login" ? await signIn(email, password) : await signUp(email, password);
    setMessage(error ?? (mode === "signup" ? "Conta criada. Verifique o email se o Supabase exigir confirmação." : null));
  }

  if (demoMode) return null;

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <p className="eyebrow">UniFlow</p>
        <h1>Entre no seu semestre</h1>
        <form onSubmit={submit} className="form-stack">
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            Senha
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              minLength={6}
              required
            />
          </label>
          {message ? <p className="form-message">{message}</p> : null}
          <button className="primary-button full" type="submit">
            {mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        <button className="link-button" onClick={() => setMode(mode === "login" ? "signup" : "login")} type="button">
          {mode === "login" ? "Criar uma conta" : "Já tenho conta"}
        </button>
      </section>
    </main>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const { demoMode, loading, user } = useAuth();
  if (loading) return <main className="loading-screen">Carregando UniFlow...</main>;
  if (!demoMode && !user) return <AuthScreen />;
  return (
    <DataProvider>
      <AppShell>{children}</AppShell>
    </DataProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}
