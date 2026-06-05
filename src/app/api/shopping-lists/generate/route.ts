import { POST as runAction } from "@/app/api/app-actions/route";

export async function POST(request: Request) {
  return runAction(
    new Request(new URL("/api/app-actions", request.url), {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ action: "generateShoppingList", payload: {} })
    })
  );
}
