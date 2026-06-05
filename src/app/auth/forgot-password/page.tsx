"use client";

import { LoaderCircle, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) {
      setMessage("Dinner Made Easy is not connected to Supabase yet.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`
    });
    setMessage(
      error
        ? error.message
        : "Check your email for a secure password reset link."
    );
    setLoading(false);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card card">
        <div className="brand-mark auth-mark">D</div>
        <p className="eyebrow">Dinner Made Easy</p>
        <h1>Reset your password</h1>
        <p>We will email a one-time link to the address on your account.</p>
        <form className="form-grid" onSubmit={submit}>
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
          {message ? <div className="auth-message">{message}</div> : null}
          <button className="primary-button" disabled={loading}>
            {loading ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Mail size={17} />
            )}
            Send reset link
          </button>
          <Link href="/auth" className="auth-inline-link">
            Return to sign in
          </Link>
        </form>
      </section>
    </main>
  );
}
