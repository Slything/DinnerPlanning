"use client";

import { deleteDB, openDB } from "idb";
import type { ShoppingList } from "@/lib/domain/types";

export interface OfflineShoppingMutation {
  id: string;
  itemId: string;
  operation: "check" | "uncheck" | "add" | "delete";
  payload?: Record<string, unknown>;
  clientTimestamp: string;
}

const DB_NAME = "dinner-made-easy";
const DB_VERSION = 1;

async function database() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("shopping-lists")) {
        db.createObjectStore("shopping-lists", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("shopping-mutations")) {
        db.createObjectStore("shopping-mutations", { keyPath: "id" });
      }
    }
  });
}

export async function saveActiveShoppingList(list: ShoppingList | null) {
  if (!list) return;
  const db = await database();
  await db.put("shopping-lists", list);
}

export async function loadActiveShoppingList(
  id: string
): Promise<ShoppingList | undefined> {
  const db = await database();
  return db.get("shopping-lists", id);
}

export async function queueShoppingMutation(
  mutation: Omit<OfflineShoppingMutation, "id" | "clientTimestamp">
) {
  const db = await database();
  const queued: OfflineShoppingMutation = {
    ...mutation,
    id: crypto.randomUUID(),
    clientTimestamp: new Date().toISOString()
  };
  await db.put("shopping-mutations", queued);
  return queued;
}

export async function syncShoppingMutations() {
  if (!navigator.onLine) return { applied: 0 };
  const db = await database();
  const mutations = (await db.getAll(
    "shopping-mutations"
  )) as OfflineShoppingMutation[];
  if (!mutations.length) return { applied: 0 };

  const response = await fetch("/api/shopping-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mutations })
  });
  if (!response.ok) throw new Error("Shopping list sync failed.");
  const result = (await response.json()) as { applied: string[] };
  const transaction = db.transaction("shopping-mutations", "readwrite");
  await Promise.all([
    ...result.applied.map((id) => transaction.store.delete(id)),
    transaction.done
  ]);
  return { applied: result.applied.length };
}

export async function clearOfflineShoppingData() {
  await deleteDB(DB_NAME);
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith("dinner-made-easy"))
        .map((key) => caches.delete(key))
    );
  }
}
