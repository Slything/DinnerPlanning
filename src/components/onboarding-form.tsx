"use client";

import { Home, LoaderCircle, Users } from "lucide-react";
import { useState } from "react";
import { SegmentedControl } from "@/components/ui";

export function OnboardingForm({ displayName }: { displayName: string }) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState(`${displayName}'s household`);
  const [defaultServings, setDefaultServings] = useState("4");
  const [weekStartsOn, setWeekStartsOn] = useState<"0" | "1">("0");
  const [invite, setInvite] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function createHousehold(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        defaultServings: Number(defaultServings),
        weekStartsOn: Number(weekStartsOn)
      })
    });
    const result = (await response.json()) as { error?: string };
    if (response.ok) window.location.href = "/";
    else setMessage(result.error ?? "Could not create the household.");
    setLoading(false);
  }

  function openInvitation(event: React.FormEvent) {
    event.preventDefault();
    const token = invite.trim().split("/").filter(Boolean).at(-1);
    if (!token) {
      setMessage("Paste the invitation link you received.");
      return;
    }
    window.location.href = `/invite/${encodeURIComponent(token)}`;
  }

  return (
    <main className="auth-shell">
      <section className="auth-card card onboarding-card">
        <div className="brand-mark auth-mark">D</div>
        <p className="eyebrow">Dinner Made Easy</p>
        <h1>Set up your household</h1>
        <p>
          Welcome, {displayName}. Create a new shared kitchen or join one from
          an invitation.
        </p>
        <SegmentedControl
          value={mode}
          options={[
            { value: "create", label: "Create household" },
            { value: "join", label: "Join household" }
          ]}
          onChange={setMode}
        />
        {mode === "create" ? (
          <form className="form-grid" onSubmit={createHousehold}>
            <label>
              Household name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                required
              />
            </label>
            <label>
              Default servings
              <input
                type="number"
                min={1}
                max={30}
                value={defaultServings}
                onChange={(event) => setDefaultServings(event.target.value)}
                required
              />
            </label>
            <label>
              Week starts on
              <select
                value={weekStartsOn}
                onChange={(event) =>
                  setWeekStartsOn(event.target.value as "0" | "1")
                }
              >
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
              </select>
            </label>
            {message ? <div className="auth-message">{message}</div> : null}
            <button className="primary-button" disabled={loading}>
              {loading ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Home size={17} />
              )}
              Create household
            </button>
          </form>
        ) : (
          <form className="form-grid" onSubmit={openInvitation}>
            <label>
              Invitation link
              <input
                value={invite}
                onChange={(event) => setInvite(event.target.value)}
                placeholder="https://.../invite/..."
                required
              />
            </label>
            {message ? <div className="auth-message">{message}</div> : null}
            <button className="primary-button">
              <Users size={17} />
              Open invitation
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
