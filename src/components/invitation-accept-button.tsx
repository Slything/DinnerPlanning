"use client";

import { LoaderCircle, Users } from "lucide-react";
import { useState } from "react";

export function InvitationAcceptButton({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function accept() {
    setLoading(true);
    const response = await fetch("/api/household-invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });
    const result = (await response.json()) as { error?: string };
    if (response.ok) window.location.href = "/";
    else setMessage(result.error ?? "This invitation could not be accepted.");
    setLoading(false);
  }

  return (
    <>
      {message ? <div className="auth-message">{message}</div> : null}
      <button className="primary-button" onClick={accept} disabled={loading}>
        {loading ? (
          <LoaderCircle className="spin" size={17} />
        ) : (
          <Users size={17} />
        )}
        Accept invitation
      </button>
    </>
  );
}
