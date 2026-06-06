"use client";

import { KeyRound, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasResetSession, setHasResetSession] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setMessage("Gather & Graze is not connected to Supabase yet.");
      setCheckingSession(false);
      return;
    }
    void supabase.auth
      .getSession()
      .then(({ data }) => setHasResetSession(Boolean(data.session)))
      .finally(() => setCheckingSession(false));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setMessage("Gather & Graze is not connected to Supabase yet.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage(error.message);
    } else {
      window.location.href = "/";
    }
    setLoading(false);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card card">
        <div className="brand-mark auth-mark">G</div>
        <p className="eyebrow">Gather &amp; Graze</p>
        <h1>Choose a new password</h1>
        {!checkingSession && !hasResetSession ? (
          <>
            <div className="auth-message">
              This reset link is expired, already used, or did not create a
              valid session. Request a fresh password reset email and use the
              newest link.
            </div>
            <Link href="/auth/forgot-password" className="secondary-button">
              Request a new reset link
            </Link>
          </>
        ) : null}
        <form className="form-grid" onSubmit={submit}>
          <label>
            New password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          {message ? <div className="auth-message">{message}</div> : null}
          <button
            className="primary-button"
            disabled={loading || checkingSession || !hasResetSession}
          >
            {loading ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <KeyRound size={17} />
            )}
            Update password
          </button>
        </form>
      </section>
    </main>
  );
}
