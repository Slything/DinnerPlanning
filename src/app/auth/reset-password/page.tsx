"use client";

import { KeyRound, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setMessage("Dinner Made Easy is not connected to Supabase yet.");
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
        <div className="brand-mark auth-mark">D</div>
        <p className="eyebrow">Dinner Made Easy</p>
        <h1>Choose a new password</h1>
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
          <button className="primary-button" disabled={loading}>
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
