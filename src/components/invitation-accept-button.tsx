"use client";

import { LoaderCircle, Users } from "lucide-react";
import { useState } from "react";

export function InvitationAcceptButton({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [switchPrompt, setSwitchPrompt] = useState<{
    currentHouseholdName: string;
    invitedHouseholdName: string;
    copiedRecipeCount: number;
  } | null>(null);

  async function accept(mode: "accept" | "switch-and-copy-recipes" = "accept") {
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/household-invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, mode })
    });
    const result = (await response.json()) as {
      error?: string;
      code?: string;
      currentHouseholdName?: string;
      invitedHouseholdName?: string;
      copiedRecipeCount?: number;
    };
    if (response.ok) window.location.href = "/";
    else if (result.code === "HOUSEHOLD_SWITCH_REQUIRED") {
      setSwitchPrompt({
        currentHouseholdName:
          result.currentHouseholdName ?? "your current household",
        invitedHouseholdName:
          result.invitedHouseholdName ?? "the invited household",
        copiedRecipeCount: result.copiedRecipeCount ?? 0
      });
    } else {
      setMessage(result.error ?? "This invitation could not be accepted.");
    }
    setLoading(false);
  }

  return (
    <>
      {message ? <div className="auth-message">{message}</div> : null}
      {switchPrompt ? (
        <div className="auth-message">
          <strong>
            You already belong to {switchPrompt.currentHouseholdName}. Join{" "}
            {switchPrompt.invitedHouseholdName} instead?
          </strong>
          <span>
            We will copy {switchPrompt.copiedRecipeCount} recipe
            {switchPrompt.copiedRecipeCount === 1 ? "" : "s"} you created.
            Pantry, plans, shopping lists, and cooking history stay with your
            current household.
          </span>
        </div>
      ) : null}
      {switchPrompt ? (
        <button
          className="primary-button"
          onClick={() => accept("switch-and-copy-recipes")}
          disabled={loading}
        >
          {loading ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Users size={17} />
          )}
          Join and copy my recipes
        </button>
      ) : (
        <button
          className="primary-button"
          onClick={() => accept()}
          disabled={loading}
        >
          {loading ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Users size={17} />
          )}
          Accept invitation
        </button>
      )}
    </>
  );
}
