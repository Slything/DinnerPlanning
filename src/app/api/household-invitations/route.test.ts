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
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: "invitation-1",
          email: "sister@example.com",
          token: "00000000-0000-4000-8000-000000000001",
          expires_at: "2026-06-13T00:00:00.000Z"
        }
      ],
      error: null
    });
    const from = vi.fn();
    vi.mocked(createAdminSupabaseClient).mockReturnValue({
      from,
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
      supabase: { rpc } as never,
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
    expect(rpc).toHaveBeenCalledWith("create_household_invitation", {
      invite_email: "sister@example.com"
    });
    expect(from).not.toHaveBeenCalled();
    expect(inviteUserByEmail).toHaveBeenCalledWith("sister@example.com", {
      redirectTo: `${PRODUCTION_APP_URL}/auth/callback?next=%2Finvite%2F${payload.token}`
    });
  });

  it("generates a household link without reserving an email", async () => {
    const inviteUserByEmail = vi.fn();
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: "invitation-1",
          email: null,
          token: "00000000-0000-4000-8000-000000000002",
          expires_at: "2026-06-13T00:00:00.000Z"
        }
      ],
      error: null
    });
    const from = vi.fn();
    vi.mocked(createAdminSupabaseClient).mockReturnValue({
      from,
      auth: {
        admin: {
          listUsers: vi.fn(),
          inviteUserByEmail
        }
      }
    } as never);
    vi.mocked(requireUser).mockResolvedValue({
      supabase: { rpc } as never,
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
    expect(rpc).toHaveBeenCalledWith("create_household_invitation", {
      invite_email: null
    });
    expect(from).not.toHaveBeenCalled();
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });
});
