import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAdminSupabaseClient,
  requireUser
} from "@/lib/supabase/server";
import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabaseClient: vi.fn(),
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
    vi.mocked(createAdminSupabaseClient).mockReturnValue(null);
    vi.mocked(requireUser).mockResolvedValue({
      supabase: {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: {
            message:
              "Invitation is invalid, expired, or belongs to another email"
          }
        })
      } as never,
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

  it("rejects a household invite when the signed-in email does not match", async () => {
    const rpc = vi.fn();
    const maybeInvitation = vi.fn().mockResolvedValue({
      data: {
        id: "invite-1",
        email: "wife@example.com",
        expires_at: "2999-01-01T00:00:00.000Z",
        accepted_at: null,
        household_id: "household-1"
      },
      error: null
    });
    vi.mocked(createAdminSupabaseClient).mockReturnValue({
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: maybeInvitation
          })
        })
      }))
    } as never);
    vi.mocked(requireUser).mockResolvedValue({
      supabase: { rpc } as never,
      user: {
        id: "user-1",
        email: "someone-else@example.com",
        displayName: "Someone"
      }
    });

    const response = await POST(request());
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(payload.error).toContain("This invitation is for wife@example.com");
    expect(payload.error).toContain("someone-else@example.com");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns switch details when the signed-in user belongs to another household", async () => {
    const rpc = vi.fn();
    vi.mocked(createAdminSupabaseClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "household_invitations") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "invite-1",
                    email: "wife@example.com",
                    expires_at: "2999-01-01T00:00:00.000Z",
                    accepted_at: null,
                    household_id: "new-household",
                    households: { name: "New Kitchen" }
                  },
                  error: null
                })
              })
            })
          };
        }
        if (table === "household_members") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    household_id: "old-household",
                    households: { name: "Old Kitchen" }
                  },
                  error: null
                })
              })
            })
          };
        }
        return {
          select: () => ({
            eq: () => ({
              eq: vi.fn().mockResolvedValue({ count: 2, error: null })
            })
          })
        };
      })
    } as never);
    vi.mocked(requireUser).mockResolvedValue({
      supabase: { rpc } as never,
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
    expect(rpc).not.toHaveBeenCalled();
  });

  it("marks an invite accepted when the user already belongs to that household", async () => {
    const rpc = vi.fn();
    const updateInvitation = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });
    vi.mocked(createAdminSupabaseClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "household_invitations") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "invite-1",
                    email: "wife@example.com",
                    expires_at: "2999-01-01T00:00:00.000Z",
                    accepted_at: null,
                    household_id: "household-1"
                  },
                  error: null
                })
              })
            }),
            update: updateInvitation
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { household_id: "household-1" },
                error: null
              })
            })
          })
        };
      })
    } as never);
    vi.mocked(requireUser).mockResolvedValue({
      supabase: { rpc } as never,
      user: {
        id: "user-1",
        email: "wife@example.com",
        displayName: "Wife"
      }
    });

    const response = await POST(request());
    const payload = (await response.json()) as { householdId: string };

    expect(response.status).toBe(200);
    expect(payload).toEqual({ householdId: "household-1" });
    expect(updateInvitation).toHaveBeenCalledWith({
      accepted_at: expect.any(String)
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("switches households when explicitly confirmed", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          household_id: "new-household",
          copied_recipe_count: 3
        }
      ],
      error: null
    });
    vi.mocked(createAdminSupabaseClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "household_invitations") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "invite-1",
                    email: "wife@example.com",
                    expires_at: "2999-01-01T00:00:00.000Z",
                    accepted_at: null,
                    household_id: "new-household",
                    households: { name: "New Kitchen" }
                  },
                  error: null
                })
              })
            })
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  household_id: "old-household",
                  households: { name: "Old Kitchen" }
                },
                error: null
              })
            })
          })
        };
      })
    } as never);
    vi.mocked(requireUser).mockResolvedValue({
      supabase: { rpc } as never,
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
    expect(rpc).toHaveBeenCalledWith("switch_household_from_invitation", {
      invitation_token: "00000000-0000-4000-8000-000000000001"
    });
  });
});
