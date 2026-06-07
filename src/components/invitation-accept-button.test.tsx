import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InvitationAcceptButton } from "@/components/invitation-accept-button";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("InvitationAcceptButton", () => {
  it("prompts existing household users before switching households", async () => {
    let requestBody: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            error: "This account already belongs to another household.",
            code: "HOUSEHOLD_SWITCH_REQUIRED",
            currentHouseholdName: "Old Kitchen",
            invitedHouseholdName: "New Kitchen",
            copiedRecipeCount: 2
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    render(
      <InvitationAcceptButton token="00000000-0000-4000-8000-000000000001" />
    );

    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));

    expect(
      await screen.findByText(/You already belong to Old Kitchen/)
    ).toBeVisible();
    expect(screen.getByText(/Join New Kitchen instead/)).toBeVisible();
    expect(screen.getByText(/copy 2 recipes/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Join and copy my recipes" })
    ).toBeVisible();
    await waitFor(() =>
      expect(requestBody).toMatchObject({
        token: "00000000-0000-4000-8000-000000000001",
        mode: "accept"
      })
    );
  });
});
