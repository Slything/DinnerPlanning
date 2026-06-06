"use client";

import { LoaderCircle, Mail, Utensils } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { authCallbackUrl } from "@/lib/app-url";
import { createClient } from "@/lib/supabase/client";

export default function AuthPage() {
  const supabase = createClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [nextPath, setNextPath] = useState("/");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    const invitedEmail = params.get("email");
    const suppliedMessage = params.get("message");
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const errorDescription =
      hashParams.get("error_description") ?? hashParams.get("error");
    if (next?.startsWith("/") && !next.startsWith("//")) setNextPath(next);
    if (invitedEmail) setEmail(invitedEmail);
    if (errorDescription) {
      setMessage(
        `${errorDescription}. The email link may have expired, already been used, or be pointing to a URL that is not allowed in Supabase.`
      );
    } else if (suppliedMessage) setMessage(suppliedMessage);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setMessage("Gather & Graze is not connected to Supabase yet.");
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
          emailRedirectTo: authCallbackUrl(nextPath)
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
      else window.location.href = nextPath;
    }
    setLoading(false);
  }

  return (
    <main className="auth-shell">
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
          {mode === "signin" ? (
            <Link href="/auth/forgot-password" className="auth-inline-link">
              Forgot your password?
            </Link>
          ) : null}
        </form>
      </section>
    </main>
  );
}
