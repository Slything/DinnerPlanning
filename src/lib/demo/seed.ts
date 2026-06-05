import { addDays, format, startOfWeek, subDays } from "date-fns";
import type {
  AppState,
  IngredientAmount,
  Recipe,
  RecipeVersion
} from "@/lib/domain/types";
import { createIngredient } from "@/lib/domain/quantities";

const householdId = "household-demo";
const davidId = "member-david";
const mayaId = "member-maya";

function version(
  recipeId: string,
  ingredients: IngredientAmount[],
  instructions: string[],
  yieldCount = 4
): RecipeVersion {
  return {
    id: `${recipeId}-v1`,
    recipeId,
    version: 1,
    createdAt: subDays(new Date(), 60).toISOString(),
    createdBy: davidId,
    note: "Original household recipe",
    yield: yieldCount,
    ingredients,
    instructions
  };
}

const recipes: Recipe[] = [
  {
    id: "recipe-tacos",
    householdId,
    title: "Smoky Chicken Tacos",
    description:
      "Weeknight tacos with lime crema, charred corn, and a little smoky heat.",
    imageUrl:
      "https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=900&q=80",
    prepMinutes: 20,
    cookMinutes: 20,
    tags: ["quick", "family favorite", "mexican"],
    favorite: true,
    currentVersion: 1,
    versions: [
      version(
        "recipe-tacos",
        [
          createIngredient("taco-chicken", "chicken breast", 1.5, "lb"),
          createIngredient("taco-onion", "yellow onion", 0.5, "count", "diced"),
          createIngredient("taco-tortilla", "corn tortillas", 12, "count"),
          createIngredient("taco-corn", "corn", 1, "can"),
          createIngredient("taco-lime", "lime", 2, "count"),
          createIngredient("taco-cream", "sour cream", 0.5, "cup"),
          createIngredient("taco-seasoning", "taco seasoning", 2, "tbsp")
        ],
        [
          "Season and sear the chicken until cooked through, then slice.",
          "Char the corn and onion in the same skillet.",
          "Mix sour cream with lime juice and a pinch of salt.",
          "Warm tortillas and assemble with chicken, vegetables, and crema."
        ]
      )
    ],
    createdAt: subDays(new Date(), 60).toISOString()
  },
  {
    id: "recipe-pasta",
    householdId,
    title: "Creamy Tuscan Pasta",
    description:
      "A cozy one-pan pasta with spinach, sun-dried tomatoes, and parmesan.",
    imageUrl:
      "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=900&q=80",
    prepMinutes: 15,
    cookMinutes: 25,
    tags: ["vegetarian", "one pan", "cozy"],
    favorite: false,
    currentVersion: 1,
    versions: [
      version(
        "recipe-pasta",
        [
          createIngredient("pasta-pasta", "penne pasta", 12, "oz"),
          createIngredient("pasta-onion", "yellow onion", 0.5, "count", "diced"),
          createIngredient("pasta-garlic", "garlic", 3, "clove", "minced"),
          createIngredient("pasta-milk", "whole milk", 1.5, "cup"),
          createIngredient("pasta-spinach", "baby spinach", 5, "oz"),
          createIngredient("pasta-parm", "parmesan cheese", 1, "cup")
        ],
        [
          "Boil pasta until just shy of al dente and reserve pasta water.",
          "Saute onion and garlic until soft.",
          "Add milk, parmesan, and pasta; simmer until glossy.",
          "Fold in spinach and loosen with pasta water as needed."
        ]
      )
    ],
    createdAt: subDays(new Date(), 42).toISOString()
  },
  {
    id: "recipe-salmon",
    householdId,
    title: "Maple Dijon Salmon",
    description:
      "Sheet-pan salmon with maple mustard glaze, broccoli, and crispy potatoes.",
    imageUrl:
      "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=900&q=80",
    prepMinutes: 15,
    cookMinutes: 30,
    tags: ["sheet pan", "high protein", "easy"],
    favorite: true,
    currentVersion: 1,
    versions: [
      version(
        "recipe-salmon",
        [
          createIngredient("salmon-fillet", "salmon fillets", 4, "count"),
          createIngredient("salmon-broccoli", "broccoli", 1, "bunch"),
          createIngredient("salmon-potato", "baby potatoes", 1.5, "lb"),
          createIngredient("salmon-maple", "maple syrup", 2, "tbsp"),
          createIngredient("salmon-mustard", "dijon mustard", 2, "tbsp")
        ],
        [
          "Roast halved potatoes at 425 F for 15 minutes.",
          "Whisk maple syrup and mustard together.",
          "Add salmon and broccoli, brush with glaze, and roast 12-15 minutes."
        ]
      )
    ],
    createdAt: subDays(new Date(), 36).toISOString()
  },
  {
    id: "recipe-curry",
    householdId,
    title: "Coconut Chickpea Curry",
    description:
      "Fast pantry curry with coconut milk, chickpeas, tomato, and warm spices.",
    imageUrl:
      "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=900&q=80",
    prepMinutes: 10,
    cookMinutes: 25,
    tags: ["vegetarian", "pantry", "quick"],
    favorite: false,
    currentVersion: 1,
    versions: [
      version(
        "recipe-curry",
        [
          createIngredient("curry-chickpea", "chickpeas", 2, "can"),
          createIngredient("curry-onion", "yellow onion", 1, "count", "diced"),
          createIngredient("curry-tomato", "crushed tomatoes", 1, "can"),
          createIngredient("curry-coconut", "coconut milk", 1, "can"),
          createIngredient("curry-spice", "curry powder", 2, "tbsp"),
          createIngredient("curry-rice", "basmati rice", 1.5, "cup")
        ],
        [
          "Saute onion until golden, then bloom curry powder.",
          "Add tomatoes, coconut milk, and chickpeas.",
          "Simmer for 20 minutes and serve over rice."
        ]
      )
    ],
    createdAt: subDays(new Date(), 25).toISOString()
  }
];

export function createDemoState(): AppState {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 0 });
  const weeklyPlanId = "plan-demo";
  const tacosDate = format(addDays(weekStart, 1), "yyyy-MM-dd");
  const pastaDate = format(addDays(weekStart, 3), "yyyy-MM-dd");
  return {
    household: {
      id: householdId,
      name: "The Harper Kitchen",
      defaultServings: 4,
      weekStartsOn: 0
    },
    members: [
      {
        id: davidId,
        householdId,
        email: "david@example.com",
        displayName: "David",
        avatarColor: "#315c4a"
      },
      {
        id: mayaId,
        householdId,
        email: "maya@example.com",
        displayName: "Maya",
        avatarColor: "#d97d54"
      }
    ],
    currentMemberId: davidId,
    recipes,
    weeklyPlan: {
      id: weeklyPlanId,
      householdId,
      weekStart: format(weekStart, "yyyy-MM-dd"),
      meals: [
        {
          id: "meal-tacos",
          householdId,
          date: tacosDate,
          kind: "recipe",
          recipeId: "recipe-tacos",
          servings: 4
        },
        {
          id: "meal-pasta",
          householdId,
          date: pastaDate,
          kind: "recipe",
          recipeId: "recipe-pasta",
          servings: 4
        },
        {
          id: "meal-out",
          householdId,
          date: format(addDays(weekStart, 5), "yyyy-MM-dd"),
          kind: "dining-out",
          servings: 4
        }
      ],
      updatedAt: now.toISOString()
    },
    pantry: [
      {
        id: "pantry-onion",
        householdId,
        name: "Yellow onion",
        canonicalName: "yellow onion",
        quantity: 1,
        unit: "count",
        dimension: "count",
        aisle: "Produce",
        needsConfirmation: false,
        updatedAt: now.toISOString()
      },
      {
        id: "pantry-rice",
        householdId,
        name: "Basmati rice",
        canonicalName: "basmati rice",
        quantity: 2,
        unit: "cups",
        dimension: "volume",
        aisle: "Pantry",
        needsConfirmation: false,
        updatedAt: now.toISOString()
      },
      {
        id: "pantry-garlic",
        householdId,
        name: "Garlic",
        canonicalName: "garlic",
        quantity: null,
        unit: "count",
        dimension: "count",
        aisle: "Produce",
        needsConfirmation: false,
        updatedAt: now.toISOString()
      },
      {
        id: "pantry-seasoning",
        householdId,
        name: "Taco seasoning",
        canonicalName: "taco seasoning",
        quantity: 5,
        unit: "tbsp",
        dimension: "volume",
        aisle: "Pantry",
        needsConfirmation: false,
        updatedAt: now.toISOString()
      }
    ],
    pantryTransactions: [],
    allocations: [],
    shoppingList: null,
    cookingSessions: [
      {
        id: "session-curry",
        householdId,
        plannedMealId: "historical-curry",
        recipeId: "recipe-curry",
        recipeVersion: 1,
        servings: 4,
        cookedAt: subDays(now, 5).toISOString(),
        cookedBy: mayaId,
        notes: "Great, but make it spicier next time.",
        adjustments: [],
        usage: []
      },
      {
        id: "session-salmon",
        householdId,
        plannedMealId: "historical-salmon",
        recipeId: "recipe-salmon",
        recipeVersion: 1,
        servings: 4,
        cookedAt: subDays(now, 18).toISOString(),
        cookedBy: davidId,
        notes: "",
        adjustments: [],
        usage: []
      }
    ],
    proposals: []
  };
}

