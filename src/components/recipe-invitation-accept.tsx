"use client";

import { BookOpen, LoaderCircle } from "lucide-react";
import { useState } from "react";

export function RecipeInvitationAccept({
  token,
  email
}: {
  token: string;
  email: string;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function accept() {
    setLoading(true);
    const response = await fetch("/api/recipe-invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });
    const result = (await response.json()) as { error?: string };
    if (response.ok) window.location.href = "/";
    else setMessage(result.error ?? "The recipe could not be copied.");
    setLoading(false);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card card">
        <div className="brand-mark auth-mark">
          <BookOpen size={24} />
        </div>
        <p className="eyebrow">Private recipe invitation</p>
        <h1>Save this recipe</h1>
        <p>
          Signed in as {email}. Accepting creates an independent copy for your
          household, with optional future source updates.
        </p>
        {message ? <div className="auth-message">{message}</div> : null}
        <button className="primary-button" onClick={accept} disabled={loading}>
          {loading ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <BookOpen size={17} />
          )}
          Add to household recipes
        </button>
      </section>
    </main>
  );
}
