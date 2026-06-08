import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/supabase/server";
import InvitationPage from "./page";

vi.mock("@/lib/supabase/server", () => ({
  requireUser: vi.fn()
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("/invite/[token]", () => {
  it("loads invite display details through the RPC without direct table reads", async () => {
    const from = vi.fn();
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          invited_household_name: "New Kitchen",
          email: null,
          expires_at: "2999-01-01T00:00:00.000Z",
          accepted_at: null,
          is_expired: false
        }
      ],
      error: null
    });
    vi.mocked(requireUser).mockResolvedValue({
      supabase: { rpc, from } as never,
      user: null
    });

    render(
      await InvitationPage({
        params: Promise.resolve({
          token: "00000000-0000-4000-8000-000000000001"
        })
      })
    );

    expect(screen.getByText("Join New Kitchen")).toBeVisible();
    expect(
      screen.getByText(
        "This single-use invitation lets a signed-in person join the household."
      )
    ).toBeVisible();
    expect(rpc).toHaveBeenCalledWith("get_household_invitation", {
      invitation_token: "00000000-0000-4000-8000-000000000001"
    });
    expect(from).not.toHaveBeenCalled();
  });
});
