import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./
];

function isPrivateAddress(address: string): boolean {
  if (address === "::1" || address.startsWith("fc") || address.startsWith("fd")) {
    return true;
  }
  if (address.startsWith("fe80:")) return true;
  return PRIVATE_V4.some((pattern) => pattern.test(address));
}

async function validateTarget(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS recipe URLs are supported.");
  }
  if (
    url.username ||
    url.password ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".local")
  ) {
    throw new Error("That recipe URL is not allowed.");
  }

  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("That recipe URL resolves to a private network.");
  }
}

export async function safeFetchRecipePage(input: string): Promise<string> {
  let current = new URL(input);
  for (let redirect = 0; redirect < 4; redirect += 1) {
    await validateTarget(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const response = await fetch(current, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": "DinnerMadeEasyRecipeImporter/1.0",
        Accept: "text/html,application/xhtml+xml"
      }
    }).finally(() => clearTimeout(timer));

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Recipe page redirect was incomplete.");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) {
      throw new Error(`Recipe page returned ${response.status}.`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      throw new Error("Recipe URL must point to an HTML page.");
    }
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > 2_000_000) throw new Error("Recipe page is too large.");
    const html = await response.text();
    if (html.length > 2_000_000) throw new Error("Recipe page is too large.");
    return html;
  }
  throw new Error("Recipe page redirected too many times.");
}

export function extractRecipeJsonLd(html: string): unknown[] {
  const scripts = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )
  ];
  const results: unknown[] = [];
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script[1].trim()) as unknown;
      const values = Array.isArray(parsed)
        ? parsed
        : typeof parsed === "object" &&
            parsed !== null &&
            "@graph" in parsed &&
            Array.isArray((parsed as { "@graph": unknown[] })["@graph"])
          ? (parsed as { "@graph": unknown[] })["@graph"]
          : [parsed];
      for (const value of values) {
        if (
          typeof value === "object" &&
          value !== null &&
          "@type" in value &&
          (value as { "@type": string | string[] })["@type"]
        ) {
          const types = Array.isArray(
            (value as { "@type": string | string[] })["@type"]
          )
            ? (value as { "@type": string[] })["@type"]
            : [(value as { "@type": string })["@type"]];
          if (types.includes("Recipe")) results.push(value);
        }
      }
    } catch {
      // Ignore malformed third-party structured data.
    }
  }
  return results;
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40_000);
}
