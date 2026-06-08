import { afterEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/supabase/server";
import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  requireUser: vi.fn()
}));

afterEach(() => {
  vi.resetAllMocks();
});

function request(
  token = "00000000-0000-4000-8000-000000000001",
  mode?: "accept" | "switch-and-copy-recipes"
) {
  return new Request("https://example.test/api/household-invitations/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, mode })
  });
}

describe("/api/household-invitations/accept", () => {
  it("keeps Supabase RPC error messages instead of returning a generic failure", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: "Invitation is invalid, expired, or belongs to another email"
      }
    });
    vi.mocked(requireUser).mockResolvedValue({
      supabase: { rpc, from: vi.fn() } as never,
      user: {
        id: "user-1",
        email: "wife@example.com",
        displayName: "Wife"
      }
    });

    const response = await POST(request());
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe(
      "Invitation is invalid, expired, or belongs to another email"
    );
  });

  it("accepts a link-only invite through the RPC without direct table reads", async () => {
    const from = vi.fn();
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          result_status: "accepted",
          target_household_id: "household-1",
          copied_recipe_count: 0
        }
      ],
      error: null
    });
    vi.mocked(requireUser).mockResolvedValue({
      supabase: { rpc, from } as never,
      user: {
        id: "user-1",
        email: "anyone@example.com",
        displayName: "Anyone"
      }
    });

    const response = await POST(request());
    const payload = (await response.json()) as {
      householdId: string;
      copiedRecipeCount: number;
    };

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      householdId: "household-1",
      copiedRecipeCount: 0
    });
    expect(rpc).toHaveBeenCalledWith(
      "accept_or_preview_household_invitation",
      {
        invitation_token: "00000000-0000-4000-8000-000000000001",
        switch_and_copy: false
      }
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("returns switch details from the RPC when the user belongs to another household", async () => {
    const from = vi.fn();
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          result_status: "switch_required",
          target_household_id: "new-household",
          current_household_name: "Old Kitchen",
          invited_household_name: "New Kitchen",
          copied_recipe_count: 2
        }
      ],
      error: null
    });
    vi.mocked(requireUser).mockResolvedValue({
      supabase: { rpc, from } as never,
      user: {
        id: "user-1",
        email: "wife@example.com",
        displayName: "Wife"
      }
    });

    const response = await POST(request());
    const payload = (await response.json()) as {
      code: string;
      currentHouseholdName: string;
      invitedHouseholdName: string;
      copiedRecipeCount: number;
    };

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      code: "HOUSEHOLD_SWITCH_REQUIRED",
      currentHouseholdName: "Old Kitchen",
      invitedHouseholdName: "New Kitchen",
      copiedRecipeCount: 2
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("switches households when explicitly confirmed", async () => {
    const from = vi.fn();
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          result_status: "accepted",
          target_household_id: "new-household",
          copied_recipe_count: 3
        }
      ],
      error: null
    });
    vi.mocked(requireUser).mockResolvedValue({
      supabase: { rpc, from } as never,
      user: {
        id: "user-1",
        email: "wife@example.com",
        displayName: "Wife"
      }
    });

    const response = await POST(
      request("00000000-0000-4000-8000-000000000001", "switch-and-copy-recipes")
    );
    const payload = (await response.json()) as {
      householdId: string;
      copiedRecipeCount: number;
    };

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      householdId: "new-household",
      copiedRecipeCount: 3
    });
    expect(rpc).toHaveBeenCalledWith(
      "accept_or_preview_household_invitation",
      {
        invitation_token: "00000000-0000-4000-8000-000000000001",
        switch_and_copy: true
      }
    );
    expect(from).not.toHaveBeenCalled();
  });
});
