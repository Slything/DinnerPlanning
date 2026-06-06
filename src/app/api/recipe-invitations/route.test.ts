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

function request() {
  return new Request(`${PRODUCTION_APP_URL}/api/recipe-invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipeId: "00000000-0000-4000-8000-000000000001",
      email: "sister@example.com"
    })
  });
}

describe("/api/recipe-invitations", () => {
  it("sends new-account recipe invites through the auth callback", async () => {
    const inviteUserByEmail = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createAdminSupabaseClient).mockReturnValue({
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
      supabase: {
        rpc: vi.fn().mockResolvedValue({
          data: {
            share_id: "share-1",
            share_token: "11111111-1111-4111-8111-111111111111",
            expires_at: "2026-06-13T00:00:00.000Z"
          },
          error: null
        })
      } as never,
      user: {
        id: "user-1",
        email: "cook@example.com",
        displayName: "Cook"
      }
    });

    const response = await POST(request());
    const payload = (await response.json()) as {
      inviteUrl: string;
    };
    const invitePath = "/recipe-invite/11111111-1111-4111-8111-111111111111";

    expect(response.status).toBe(200);
    expect(payload.inviteUrl).toBe(`${PRODUCTION_APP_URL}${invitePath}`);
    expect(inviteUserByEmail).toHaveBeenCalledWith("sister@example.com", {
      redirectTo: `${PRODUCTION_APP_URL}/auth/callback?next=${encodeURIComponent(invitePath)}`
    });
  });
});
