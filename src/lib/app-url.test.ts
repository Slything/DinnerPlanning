import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PRODUCTION_APP_URL,
  appUrl,
  authCallbackUrl,
  getPublicAppOrigin
} from "@/lib/app-url";

const originalLocation = window.location;

function setWindowOrigin(origin: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(origin)
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation
  });
});

describe("app URL helpers", () => {
  it("uses NEXT_PUBLIC_APP_URL when configured", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_APP_URL",
      "https://dinnerplanning-production.up.railway.app/"
    );

    expect(getPublicAppOrigin()).toBe(PRODUCTION_APP_URL);
    expect(appUrl("/invite/token")).toBe(`${PRODUCTION_APP_URL}/invite/token`);
  });

  it("falls back to localhost only during local browser development", () => {
    setWindowOrigin("http://localhost:3000/auth");

    expect(getPublicAppOrigin()).toBe("http://localhost:3000");
  });

  it("builds callback URLs with a safe next path", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", PRODUCTION_APP_URL);

    expect(authCallbackUrl("/auth/reset-password")).toBe(
      `${PRODUCTION_APP_URL}/auth/callback?next=%2Fauth%2Freset-password`
    );
    expect(authCallbackUrl("https://evil.example.com")).toBe(
      `${PRODUCTION_APP_URL}/auth/callback?next=%2F`
    );
  });
});
