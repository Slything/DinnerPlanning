import { describe, expect, it } from "vitest";
import {
  canonicalizeIngredient,
  formatIngredientLine,
  formatQuantity,
  normalizeUnit,
  parseQuantity,
  resolveUnitInput,
  unitLabel,
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

  it("resolves package unit aliases while keeping friendly recipe units", () => {
    expect(resolveUnitInput("each")).toEqual({
      unit: "count",
      dimension: "count"
    });
    expect(resolveUnitInput("boxes")).toEqual({
      unit: "box",
      dimension: "package"
    });
    expect(resolveUnitInput("cup")).toEqual({
      unit: "cup",
      dimension: "volume"
    });
    expect(toBaseQuantity(2, "boxes").unit).toBe("box");
  });

  it("formats household-friendly fractions", () => {
    expect(formatQuantity(0.5)).toBe("1/2");
    expect(formatQuantity(1.5)).toBe("1 1/2");
    expect(formatQuantity(2)).toBe("2");
  });

  it("hides count behind household-friendly unit labels", () => {
    expect(unitLabel("count")).toBe("each");
    expect(
      formatIngredientLine({
        name: "onion",
        quantity: 0.5,
        unit: "count"
      })
    ).toBe("1/2 onion");
    expect(
      formatIngredientLine({
        name: "garlic",
        quantity: 3,
        unit: "clove"
      })
    ).toBe("3 cloves garlic");
  });

  it("canonicalizes common ingredient wording", () => {
    expect(canonicalizeIngredient("Large yellow onions, diced")).toBe(
      "yellow onion"
    );
  });
});
