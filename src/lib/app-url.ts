export const PRODUCTION_APP_URL =
  "https://dinnerplanning-production.up.railway.app";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function isLocalOrigin(value: string) {
  try {
    const url = new URL(value);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function getPublicAppOrigin(fallbackOrigin?: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return trimTrailingSlash(configured);

  if (fallbackOrigin) return trimTrailingSlash(fallbackOrigin);

  if (typeof window !== "undefined" && isLocalOrigin(window.location.origin)) {
    return trimTrailingSlash(window.location.origin);
  }

  return PRODUCTION_APP_URL;
}

export function appUrl(path: string, fallbackOrigin?: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getPublicAppOrigin(fallbackOrigin)}${normalizedPath}`;
}

export function authCallbackUrl(nextPath = "/", fallbackOrigin?: string) {
  const next = nextPath.startsWith("/") && !nextPath.startsWith("//")
    ? nextPath
    : "/";
  return appUrl(
    `/auth/callback?next=${encodeURIComponent(next)}`,
    fallbackOrigin
  );
}
