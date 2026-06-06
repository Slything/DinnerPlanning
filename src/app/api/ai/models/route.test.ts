import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { requireUser } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  requireUser: vi.fn()
}));

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  delete process.env.OPENROUTER_API_KEY;
});

describe("/api/ai/models", () => {
  it("returns setup metadata when OpenRouter is not configured", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      supabase: {} as never,
      user: {
        id: "user-1",
        email: "cook@example.com",
        displayName: "Cook"
      }
    });

    const response = await GET();
    const payload = (await response.json()) as {
      error: string;
      setupRequired: boolean;
      missingVariables: string[];
      railwayHint: string;
    };

    expect(response.status).toBe(503);
    expect(payload.setupRequired).toBe(true);
    expect(payload.missingVariables).toEqual(["OPENROUTER_API_KEY"]);
    expect(payload.railwayHint).toContain("Railway");
    expect(payload.error).not.toContain("test-key");
  });
});
