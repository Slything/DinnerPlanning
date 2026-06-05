"use client";

import { Check, LoaderCircle, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

export default function AcceptInvitationPage() {
  const params = useParams<{ token: string }>();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [accepted, setAccepted] = useState(false);

  async function accept() {
    setLoading(true);
    const response = await fetch("/api/household-invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: params.token })
    });
    const result = (await response.json()) as {
      householdId?: string;
      error?: string;
    };
    setLoading(false);
    setAccepted(response.ok);
    setMessage(
      response.ok
        ? "You joined the household. The shared kitchen is ready."
        : result.error ?? "This invitation could not be accepted."
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-card card">
        <div className="brand-mark auth-mark">
          {accepted ? <Check size={24} /> : <Users size={24} />}
        </div>
        <p className="eyebrow">Household invitation</p>
        <h1>{accepted ? "You’re in" : "Join the kitchen"}</h1>
        <p>
          Sign in with the invited email address, then join the shared recipes,
          pantry, plans, and shopping list.
        </p>
        {message ? <div className="auth-message">{message}</div> : null}
        {accepted ? (
          <Link href="/" className="primary-button">
            Open household
          </Link>
        ) : (
          <>
            <button
              className="primary-button"
              onClick={accept}
              disabled={loading}
            >
              {loading ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Users size={17} />
              )}
              Accept invitation
            </button>
            <Link href="/auth" className="secondary-button">
              Sign in first
            </Link>
          </>
        )}
      </section>
    </main>
  );
}

