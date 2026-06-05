import { describe, expect, it } from "vitest";
import {
  canonicalizeIngredient,
  formatQuantity,
  normalizeUnit,
  parseQuantity,
  scaleQuantity,
  toBaseQuantity
} from "@/lib/domain/quantities";

describe("quantity helpers", () => {
  it("parses common fractions and mixed numbers", () => {
    expect(parseQuantity("1/2")).toBe(0.5);
    expect(parseQuantity("1 1/2")).toBe(1.5);
    expect(parseQuantity("½")).toBe(0.5);
    expect(parseQuantity("2")).toBe(2);
  });

  it("normalizes compatible volume and mass units", () => {
    expect(toBaseQuantity(1, "cup").quantity).toBeCloseTo(236.588);
    expect(toBaseQuantity(1, "lb").quantity).toBeCloseTo(453.592);
    expect(normalizeUnit("tbsp").dimension).toBe("volume");
    expect(normalizeUnit("can").dimension).toBe("package");
  });

  it("scales quantities by planned servings", () => {
    expect(scaleQuantity(2, 4, 6)).toBe(3);
    expect(scaleQuantity(null, 4, 6)).toBeNull();
  });

  it("formats household-friendly fractions", () => {
    expect(formatQuantity(0.5)).toBe("1/2");
    expect(formatQuantity(1.5)).toBe("1 1/2");
    expect(formatQuantity(2)).toBe("2");
  });

  it("canonicalizes common ingredient wording", () => {
    expect(canonicalizeIngredient("Large yellow onions, diced")).toBe(
      "yellow onion"
    );
  });
});
