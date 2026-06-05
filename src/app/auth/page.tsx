"use client";

import { ArrowLeft, LoaderCircle, Mail, Utensils } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AuthPage() {
  const supabase = createClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setMessage(
        "Supabase is not configured yet. The main app is available in local demo mode."
      );
      return;
    }
    setLoading(true);
    setMessage("");
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      });
      setMessage(
        error
          ? error.message
          : "Check your email to confirm your individual account."
      );
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) setMessage(error.message);
      else window.location.href = "/";
    }
    setLoading(false);
  }

  return (
    <main className="auth-shell">
      <Link href="/" className="auth-back">
        <ArrowLeft size={16} /> Back to demo
      </Link>
      <section className="auth-card card">
        <div className="brand-mark auth-mark">G</div>
        <p className="eyebrow">Gather &amp; Graze</p>
        <h1>{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
        <p>
          Each person signs in separately. Recipes, plans, pantry, and shopping
          stay together inside the household.
        </p>
        <div className="segmented-control">
          <button
            className={mode === "signin" ? "active" : ""}
            onClick={() => setMode("signin")}
            type="button"
          >
            Sign in
          </button>
          <button
            className={mode === "signup" ? "active" : ""}
            onClick={() => setMode("signup")}
            type="button"
          >
            New account
          </button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          {mode === "signup" ? (
            <label>
              Your name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="name"
                required
              />
            </label>
          ) : null}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              minLength={8}
              required
            />
          </label>
          {message ? <div className="auth-message">{message}</div> : null}
          <button className="primary-button" disabled={loading}>
            {loading ? (
              <LoaderCircle className="spin" size={17} />
            ) : mode === "signin" ? (
              <Mail size={17} />
            ) : (
              <Utensils size={17} />
            )}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}

