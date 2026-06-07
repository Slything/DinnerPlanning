import { afterEach, describe, expect, it, vi } from "vitest";
import { PRODUCTION_APP_URL } from "@/lib/app-url";
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

function request(email = "sister@example.com") {
  return new Request(`${PRODUCTION_APP_URL}/api/household-invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
}

describe("/api/household-invitations", () => {
  it("sends new-account invite emails through the auth callback", async () => {
    const inviteUserByEmail = vi.fn().mockResolvedValue({ error: null });
    const singleInvitation = vi.fn().mockResolvedValue({
      data: {
        id: "invitation-1",
        email: "sister@example.com",
        expires_at: "2026-06-13T00:00:00.000Z"
      },
      error: null
    });
    const singleMembership = vi.fn().mockResolvedValue({
      data: { household_id: "household-1" },
      error: null
    });
    vi.mocked(createAdminSupabaseClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "household_members") {
          return {
            select: () => ({
              eq: () => ({ single: singleMembership })
            })
          };
        }
        return {
          insert: () => ({
            select: () => ({ single: singleInvitation })
          })
        };
      }),
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({
            data: { users: [] },
            error: null
          }),
          inviteUserByEmail
        }
      }
    } as never);
    vi.mocked(requireUser).mockResolvedValue({
      supabase: {} as never,
      user: {
        id: "user-1",
        email: "cook@example.com",
        displayName: "Cook"
      }
    });

    const response = await POST(request());
    const payload = (await response.json()) as {
      token: string;
      inviteUrl: string;
    };

    expect(response.status).toBe(200);
    expect(payload.inviteUrl).toBe(`${PRODUCTION_APP_URL}/invite/${payload.token}`);
    expect(inviteUserByEmail).toHaveBeenCalledWith("sister@example.com", {
      redirectTo: `${PRODUCTION_APP_URL}/auth/callback?next=%2Finvite%2F${payload.token}`
    });
  });

  it("generates a household link without reserving an email", async () => {
    const inviteUserByEmail = vi.fn();
    const insertedRows: Array<Record<string, unknown>> = [];
    const singleInvitation = vi.fn().mockResolvedValue({
      data: {
        id: "invitation-1",
        email: null,
        expires_at: "2026-06-13T00:00:00.000Z"
      },
      error: null
    });
    const singleMembership = vi.fn().mockResolvedValue({
      data: { household_id: "household-1" },
      error: null
    });
    vi.mocked(createAdminSupabaseClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "household_members") {
          return {
            select: () => ({
              eq: () => ({ single: singleMembership })
            })
          };
        }
        return {
          insert: (row: Record<string, unknown>) => {
            insertedRows.push(row);
            return {
              select: () => ({ single: singleInvitation })
            };
          }
        };
      }),
      auth: {
        admin: {
          listUsers: vi.fn(),
          inviteUserByEmail
        }
      }
    } as never);
    vi.mocked(requireUser).mockResolvedValue({
      supabase: {} as never,
      user: {
        id: "user-1",
        email: "cook@example.com",
        displayName: "Cook"
      }
    });

    const response = await POST(request(""));
    const payload = (await response.json()) as {
      email: string | null;
      token: string;
      inviteUrl: string;
      emailSent: boolean;
    };

    expect(response.status).toBe(200);
    expect(payload.email).toBeNull();
    expect(payload.emailSent).toBe(false);
    expect(payload.inviteUrl).toBe(`${PRODUCTION_APP_URL}/invite/${payload.token}`);
    expect(insertedRows[0]).toMatchObject({
      household_id: "household-1",
      email: null,
      invited_by: "user-1"
    });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });
});
