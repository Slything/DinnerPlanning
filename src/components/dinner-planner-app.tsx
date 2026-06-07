"use client";

import {
  Apple,
  BookOpen,
  CalendarDays,
  Check,
  ChefHat,
  ChevronRight,
  CircleAlert,
  Download,
  Globe2,
  Heart,
  Home,
  LoaderCircle,
  LogOut,
  PackageCheck,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Share2,
  ShoppingBasket,
  Sparkles,
  Trash2,
  Users,
  WifiOff
} from "lucide-react";
import {
  addDays,
  format,
  isSameDay,
  parseISO,
  startOfDay,
  startOfWeek
} from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AiModelOption,
  GroceryAisle,
  IngredientAmount,
  PlannedMeal,
  Recipe,
  SharedRecipeSnapshot
} from "@/lib/domain/types";
import {
  UNIT_OPTIONS,
  createIngredient,
  formatIngredientAmount,
  formatIngredientLine,
  inferAisle,
  normalizeUnit,
  parseQuantity,
  resolveUnitInput,
  unitLabel
} from "@/lib/domain/quantities";
import {
  buildPantryReview,
  currentRecipeVersion
} from "@/lib/domain/shopping";
import { rankRecipeSuggestions } from "@/lib/domain/suggestions";
import {
  filterAndSortRecipes
} from "@/lib/domain/recipe-filters";
import {
  recipeLabels,
  recipeSourceLabel,
  recipeSourceType,
  recipeTagsForSave
} from "@/lib/domain/recipe-labels";
import {
  mergedIngredientCatalog,
  resolveIngredientInput,
  searchIngredientSuggestions
} from "@/lib/domain/ingredient-catalog";
import { useAppStore } from "@/lib/store/store";
import { createClient } from "@/lib/supabase/client";
import { clearOfflineShoppingData } from "@/lib/offline/shopping-queue";
import {
  Avatar,
  EmptyState,
  Modal,
  SegmentedControl
} from "@/components/ui";

type Tab = "week" | "recipes" | "pantry" | "shopping" | "settings";

const TAB_ITEMS: Array<{
  value: Exclude<Tab, "settings">;
  label: string;
  icon: typeof CalendarDays;
}> = [
  { value: "week", label: "Week", icon: CalendarDays },
  { value: "recipes", label: "Recipes", icon: BookOpen },
  { value: "pantry", label: "Pantry", icon: PackageCheck },
  { value: "shopping", label: "Shop", icon: ShoppingBasket }
];

function mealRecipe(meal: PlannedMeal | undefined, recipes: Recipe[]) {
  if (!meal?.recipeId) return undefined;
  return recipes.find((recipe) => recipe.id === meal.recipeId);
}

function quantityLabel(quantity: number | null, unit: string) {
  if (quantity === null) return `In stock · amount unknown`;
  return `In stock · ${formatIngredientAmount({ quantity, unit })}`;
}

function formatDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function currentPlanningWeekStart(weekStartsOn: 0 | 1): string {
  return formatDateKey(startOfWeek(new Date(), { weekStartsOn }));
}

function shiftedWeekStart(weekStart: string, days: number): string {
  return formatDateKey(addDays(parseISO(weekStart), days));
}

function formatWeekRange(weekStart: string): string {
  const start = parseISO(weekStart);
  const end = addDays(start, 6);
  if (format(start, "yyyy-MM") === format(end, "yyyy-MM")) {
    return `${format(start, "MMM d")}-${format(end, "d, yyyy")}`;
  }
  return `${format(start, "MMM d")}-${format(end, "MMM d, yyyy")}`;
}

const PLACEHOLDER_RECIPE_IMAGE =
  "https://images.unsplash.com/photo-1543353071-873f17a7a088?auto=format&fit=crop&w=900&q=80";

function realRecipeImage(recipe: Recipe): string | undefined {
  if (!recipe.imageUrl || recipe.imageUrl === PLACEHOLDER_RECIPE_IMAGE) {
    return undefined;
  }
  return recipe.imageUrl;
}

function UnitInput({
  value,
  onChange,
  listId,
  disabled = false,
  placeholder = "Unit"
}: {
  value: string;
  onChange: (unit: string, dimension: IngredientAmount["dimension"]) => void;
  listId: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(unitLabel(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(unitLabel(value));
  }, [focused, value]);

  function update(input: string) {
    const resolved = resolveUnitInput(input);
    onChange(resolved.unit, resolved.dimension);
  }

  return (
    <span className="unit-input-wrap">
      <input
        list={listId}
        value={focused ? draft : unitLabel(value)}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={(event) => {
          setFocused(true);
          setDraft(event.currentTarget.value);
          event.currentTarget.select();
        }}
        onChange={(event) => {
          const input = event.target.value;
          setDraft(input);
          if (input.trim()) update(input);
        }}
        onBlur={(event) => {
          setFocused(false);
          update(event.target.value);
        }}
      />
      <datalist id={listId}>
        {UNIT_OPTIONS.map((option) => (
          <option value={option.label} key={option.value}>
            {option.value}
          </option>
        ))}
      </datalist>
    </span>
  );
}

export function DinnerPlannerApp() {
  const { state, loaded, error } = useAppStore();
  const [tab, setTab] = useState<Tab>("week");
  const [toast, setToast] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (
        event.target instanceof Node &&
        !profileMenuRef.current?.contains(event.target)
      ) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [profileMenuOpen]);

  if (!loaded) {
    return (
      <div className="app-loading">
        <LoaderCircle className="spin" />
        <span>Setting the table…</span>
      </div>
    );
  }

  const currentMember =
    state.members.find((member) => member.id === state.currentMemberId) ??
    state.members[0];
  const unchecked =
    state.shoppingList?.items.filter((item) => !item.checked).length ?? 0;
  const pendingProposals = state.proposals.filter(
    (proposal) => proposal.status === "pending"
  ).length;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">G</div>
          <div>
            <div className="brand-wordmark">Gather &amp; Graze</div>
            <p className="brand-subtitle">{state.household.name}</p>
          </div>
        </div>
        <div className="header-actions" ref={profileMenuRef}>
          <button
            className="avatar-button"
            type="button"
            onClick={() => setProfileMenuOpen((current) => !current)}
            aria-expanded={profileMenuOpen}
            aria-haspopup="menu"
            aria-label="Open profile menu"
          >
            <Avatar
              name={currentMember.displayName}
              color={currentMember.avatarColor}
              imageUrl={currentMember.avatarUrl}
              small
            />
          </button>
          {profileMenuOpen ? (
            <div className="profile-menu" role="menu">
              <div className="profile-menu-heading">
                <strong>{currentMember.displayName}</strong>
                <span>{state.household.name}</span>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setTab("settings");
                  setProfileMenuOpen(false);
                }}
              >
                <Settings size={16} />
                Settings
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="app-main">
        {tab === "week" ? <WeekScreen notify={setToast} /> : null}
        {tab === "recipes" ? <RecipesScreen notify={setToast} /> : null}
        {tab === "pantry" ? <PantryScreen notify={setToast} /> : null}
        {tab === "shopping" ? <ShoppingScreen notify={setToast} /> : null}
        {tab === "settings" ? <HouseholdScreen notify={setToast} /> : null}
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        {TAB_ITEMS.map((item) => {
          const Icon = item.icon;
          const badge =
            item.value === "shopping"
              ? unchecked
              : item.value === "recipes"
                ? pendingProposals
                : 0;
          return (
            <button
              key={item.value}
              type="button"
              className={tab === item.value ? "active" : ""}
              onClick={() => {
                setTab(item.value);
                setProfileMenuOpen(false);
              }}
            >
              <span className="nav-badge-wrap">
                <Icon size={20} />
                {badge ? <span className="nav-badge">{badge}</span> : null}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {toast ? <div className="toast">{toast}</div> : null}
      {error ? <div className="toast">{error}</div> : null}
    </div>
  );
}

function WeekScreen({ notify }: { notify: (message: string) => void }) {
  const { state, removeMeal, setSelectedWeek } = useAppStore();
  const [pickerDate, setPickerDate] = useState<string | null>(null);
  const [cookMealId, setCookMealId] = useState<string | null>(null);
  const [editRecipeId, setEditRecipeId] = useState<string | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [loadingWeek, setLoadingWeek] = useState<string | null>(null);
  const selectedWeekStart = state.weeklyPlan.weekStart;
  const currentWeekStart = currentPlanningWeekStart(
    state.household.weekStartsOn
  );
  const selectedWeekRange = formatWeekRange(selectedWeekStart);
  const isCurrentWeek = selectedWeekStart === currentWeekStart;
  const days = Array.from({ length: 7 }, (_, index) =>
    addDays(parseISO(selectedWeekStart), index)
  );
  const suggestions = rankRecipeSuggestions({
    recipes: state.recipes,
    sessions: state.cookingSessions,
    plannedMeals: state.weeklyPlan.meals
  }).slice(0, 3);
  const pending = state.proposals.filter(
    (proposal) => proposal.status === "pending"
  );
  async function chooseWeek(weekStart: string) {
    setLoadingWeek(weekStart);
    try {
      await setSelectedWeek(weekStart);
    } finally {
      setLoadingWeek(null);
    }
  }

  return (
    <>
      <div className="screen-header">
        <div>
          <p className="eyebrow">{selectedWeekRange}</p>
          <h1>{isCurrentWeek ? "This week" : "Planning week"}</h1>
          <p>
            A calmer week starts with seven small decisions. Blank nights are
            allowed.
          </p>
        </div>
        <button
          className="primary-button"
          onClick={() =>
            setPickerDate(
              format(
                days.find(
                  (day) =>
                    !state.weeklyPlan.meals.some(
                      (meal) => meal.date === format(day, "yyyy-MM-dd")
                    )
                ) ?? days[0],
                "yyyy-MM-dd"
              )
            )
          }
        >
          <Plus size={17} />
          <span className="header-cta-label">Add dinner</span>
        </button>
      </div>

      <div className="week-switcher card">
        <button
          className="secondary-button"
          disabled={Boolean(loadingWeek)}
          onClick={() => void chooseWeek(shiftedWeekStart(selectedWeekStart, -7))}
        >
          Previous week
        </button>
        <div className="week-switcher-current">
          <span>Planning groceries for</span>
          <strong>{selectedWeekRange}</strong>
        </div>
        <button
          className="secondary-button"
          disabled={Boolean(loadingWeek) || isCurrentWeek}
          onClick={() => void chooseWeek(currentWeekStart)}
        >
          Current week
        </button>
        <button
          className="secondary-button"
          disabled={Boolean(loadingWeek)}
          onClick={() => void chooseWeek(shiftedWeekStart(selectedWeekStart, 7))}
        >
          Next week
        </button>
      </div>

      {pending.length ? (
        <button
          type="button"
          className="alert-card card"
          onClick={() => setProposalId(pending[0].id)}
        >
          <Sparkles size={21} color="#d97d54" />
          <div className="row-main">
            <strong>
              {pending.length} recipe improvement
              {pending.length === 1 ? "" : "s"} ready
            </strong>
            <p>Review what you learned the last time you cooked.</p>
          </div>
          <ChevronRight size={18} />
        </button>
      ) : null}

      <div className="week-grid">
        {days.map((day) => {
          const date = format(day, "yyyy-MM-dd");
          const meal = state.weeklyPlan.meals.find(
            (candidate) => candidate.date === date
          );
          const recipe = mealRecipe(meal, state.recipes);
          return (
            <article className="day-card card" key={date}>
              <button
                className={`day-label ${
                  isSameDay(day, startOfDay(new Date())) ? "today" : ""
                }`}
                onClick={() => setPickerDate(date)}
                type="button"
              >
                <span>{format(day, "EEE")}</span>
                <strong>{format(day, "d")}</strong>
              </button>
              <button
                className="row-main meal-copy"
                onClick={() => setPickerDate(date)}
                type="button"
              >
                {recipe ? (
                  <>
                    <h3 className="meal-title">{recipe.title}</h3>
                    <div className="meal-meta">
                      {recipeLabels(recipe).slice(0, 2).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                      {meal?.cookedAt ? (
                        <span className="cooked-badge">
                          <Check size={11} /> Cooked
                        </span>
                      ) : null}
                    </div>
                  </>
                ) : meal?.kind === "leftovers" ? (
                  <>
                    <h3 className="meal-title">Leftovers night</h3>
                    <div className="meal-meta">A gift from past you</div>
                  </>
                ) : meal?.kind === "dining-out" ? (
                  <>
                    <h3 className="meal-title">Dining out</h3>
                    <div className="meal-meta">No groceries needed</div>
                  </>
                ) : (
                  <span className="meal-empty">Tap to choose dinner</span>
                )}
              </button>
              <div className="meal-actions">
                {recipe && !meal?.cookedAt ? (
                  <button
                    className="mini-button"
                    onClick={() => setCookMealId(meal!.id)}
                    aria-label={`Mark ${recipe.title} cooked`}
                  >
                    <ChefHat size={17} />
                  </button>
                ) : null}
                {meal ? (
                  <button
                    className="mini-button"
                    onClick={() => {
                      removeMeal(meal.id);
                      notify("Dinner removed. Pantry reservations updated.");
                    }}
                    aria-label="Remove dinner"
                  >
                    <Trash2 size={16} />
                  </button>
                ) : (
                  <button
                    className="mini-button"
                    onClick={() => setPickerDate(date)}
                    aria-label="Add dinner"
                  >
                    <Plus size={17} />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="section-title">
        <div>
          <p className="eyebrow">A little variety</p>
          <h2>Good fits for this week</h2>
        </div>
      </div>
      <div className="suggestion-strip">
        {suggestions.map((suggestion, index) => (
          <button
            type="button"
            className="suggestion-card card"
            key={suggestion.recipe.id}
            onClick={() => {
              const free = days.find(
                (day) =>
                  !state.weeklyPlan.meals.some(
                    (meal) => meal.date === format(day, "yyyy-MM-dd")
                  )
              );
              setPickerDate(format(free ?? days[0], "yyyy-MM-dd"));
            }}
          >
            <span className="tag">{suggestion.reason}</span>
            <h3>{suggestion.recipe.title}</h3>
            <p>
              {recipeSourceLabel(suggestion.recipe) ??
                recipeLabels(suggestion.recipe)[0] ??
                "Household recipe"}
            </p>
            <span className="suggestion-number">0{index + 1}</span>
          </button>
        ))}
      </div>

      <MealPickerModal
        date={pickerDate}
        onClose={() => setPickerDate(null)}
        notify={notify}
      />
      <CookingReviewModal
        mealId={cookMealId}
        onClose={() => setCookMealId(null)}
        onChangeNextTime={(recipeId) => setEditRecipeId(recipeId)}
        notify={notify}
      />
      <RecipeEditorModal
        open={Boolean(editRecipeId)}
        recipeId={editRecipeId ?? undefined}
        onClose={() => setEditRecipeId(null)}
        notify={notify}
      />
      <ProposalReviewModal
        proposalId={proposalId}
        onClose={() => setProposalId(null)}
        notify={notify}
      />
    </>
  );
}

function MealPickerModal({
  date,
  onClose,
  notify
}: {
  date: string | null;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const { state, scheduleRecipe, scheduleSpecial } = useAppStore();
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<
    "all" | "mine" | "public" | "favorites"
  >("all");
  const recipes = state.recipes
    .filter(
      (recipe, index, allRecipes) =>
        allRecipes.findIndex((candidate) => candidate.id === recipe.id) === index
    )
    .filter((recipe) => {
      const sourceType = recipeSourceType(recipe);
      const haystack = [
        recipe.title,
        ...recipeLabels(recipe),
        recipeSourceLabel(recipe) ?? ""
      ]
        .join(" ")
        .toLowerCase();
      const matchesQuery = haystack.includes(query.toLowerCase());
      const matchesSource =
        sourceFilter === "all" ||
        (sourceFilter === "mine" && sourceType !== "saved-copy") ||
        (sourceFilter === "public" && sourceType === "public-owned") ||
        (sourceFilter === "favorites" && recipe.favorite);
      return matchesQuery && matchesSource;
    })
    .sort((left, right) => {
      const leftSaved = recipeSourceType(left) === "saved-copy";
      const rightSaved = recipeSourceType(right) === "saved-copy";
      if (leftSaved !== rightSaved) return leftSaved ? 1 : -1;
      return left.title.localeCompare(right.title);
    });

  return (
    <Modal
      open={Boolean(date)}
      title={date ? format(parseISO(date), "EEEE, MMMM d") : "Choose dinner"}
      eyebrow="Plan dinner"
      onClose={onClose}
    >
      <div className="form-grid">
        <label>
          Find a recipe
          <input
            value={query}
            placeholder="Search recipes"
                onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="filter-row">
        {[
          ["all", "All"],
          ["mine", "My recipes"],
          ["public", "Public"],
          ["favorites", "Favorites"]
        ].map(([value, label]) => (
          <button
            className={
              sourceFilter === value ? "filter-chip active" : "filter-chip"
            }
            key={value}
            type="button"
            onClick={() =>
              setSourceFilter(
                value as "all" | "mine" | "public" | "favorites"
              )
            }
          >
            {label}
          </button>
        ))}
      </div>
      <div className="meal-picker-list">
        {recipes.map((recipe) => (
          <button
            className="meal-picker-item"
            type="button"
            key={recipe.id}
            onClick={() => {
              scheduleRecipe(date!, recipe.id);
              notify(`${recipe.title} added to the week.`);
              onClose();
            }}
          >
            <span className="row-main">
              <strong>{recipe.title}</strong>
              <span>
                {[...recipeLabels(recipe), recipeSourceLabel(recipe)]
                  .filter(Boolean)
                  .join(" · ") || "Household recipe"}
              </span>
            </span>
            <ChevronRight size={17} />
          </button>
        ))}
        <div className="form-two">
          <button
            className="secondary-button"
            onClick={() => {
              scheduleSpecial(date!, "leftovers");
              notify("Leftovers night added.");
              onClose();
            }}
          >
            Leftovers
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              scheduleSpecial(date!, "dining-out");
              notify("Dining out added.");
              onClose();
            }}
          >
            Dining out
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RecipesScreen({ notify }: { notify: (message: string) => void }) {
  const { state, toggleFavorite } = useAppStore();
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [neverCookedOnly, setNeverCookedOnly] = useState(false);
  const [quickCookOnly, setQuickCookOnly] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [communityOpen, setCommunityOpen] = useState(false);
  const pending = state.proposals.filter(
    (proposal) => proposal.status === "pending"
  );
  const recipes = filterAndSortRecipes(
    state.recipes,
    state.cookingSessions,
    {
      query,
      sort: "least-recent",
      favoritesOnly,
      neverCookedOnly,
      quickCookOnly
    }
  );

  return (
    <>
      <div className="screen-header">
        <div>
          <p className="eyebrow">{state.recipes.length} household recipes</p>
          <h1>Recipe Book</h1>
        </div>
        <div className="header-actions">
          <button
            className="secondary-button"
            onClick={() => setCommunityOpen(true)}
          >
            <Globe2 size={17} />
            <span className="header-cta-label">Community</span>
          </button>
          <button className="primary-button" onClick={() => setEditorOpen(true)}>
            <Plus size={17} />
            <span className="header-cta-label">Add recipe</span>
          </button>
        </div>
      </div>

      {pending.length ? (
        <button
          className="alert-card card"
          type="button"
          onClick={() => setProposalId(pending[0].id)}
        >
          <Sparkles size={21} color="#d97d54" />
          <div className="row-main">
            <strong>Cooking feedback is ready to review</strong>
            <p>
              Approve changes before they affect future plans and groceries.
            </p>
          </div>
          <ChevronRight size={18} />
        </button>
      ) : null}

      <div className="search-row search-row-single">
        <div className="search-input-wrap">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by recipe, ingredient, or Quick Cook"
          />
        </div>
      </div>
      <div className="filter-row">
        <button
          className={favoritesOnly ? "filter-chip active" : "filter-chip"}
          type="button"
          onClick={() => setFavoritesOnly((current) => !current)}
        >
          Favorites
        </button>
        <button
          className={neverCookedOnly ? "filter-chip active" : "filter-chip"}
          type="button"
          onClick={() => setNeverCookedOnly((current) => !current)}
        >
          Never cooked
        </button>
        <button
          className={quickCookOnly ? "filter-chip active" : "filter-chip"}
          type="button"
          onClick={() => setQuickCookOnly((current) => !current)}
        >
          Quick Cook
        </button>
      </div>

      <div className="recipe-grid">
        {recipes.map((recipe) => (
          <article className="recipe-card card" key={recipe.id}>
            <button
              className="favorite-button recipe-card-favorite"
              type="button"
              onClick={() => toggleFavorite(recipe.id)}
              aria-label={
                recipe.favorite ? "Remove from favorites" : "Add to favorites"
              }
            >
              <Heart
                size={18}
                fill={recipe.favorite ? "currentColor" : "none"}
              />
            </button>
            <button
              type="button"
              className="recipe-card-body"
              onClick={() => setDetailId(recipe.id)}
            >
              <h3>{recipe.title}</h3>
              <p>{recipe.description}</p>
              <div className="tag-row">
                {[...recipeLabels(recipe), recipeSourceLabel(recipe)]
                  .filter(Boolean)
                  .map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
              {recipe.updateAvailable ? (
                <span className="cooked-badge">Update available</span>
              ) : null}
            </button>
          </article>
        ))}
      </div>

      <RecipeEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        notify={notify}
      />
      <RecipeDetailModal
        recipeId={detailId}
        onClose={() => setDetailId(null)}
        notify={notify}
      />
      <ProposalReviewModal
        proposalId={proposalId}
        onClose={() => setProposalId(null)}
        notify={notify}
      />
      <CommunityRecipeModal
        open={communityOpen}
        onClose={() => setCommunityOpen(false)}
        notify={notify}
      />
    </>
  );
}

interface IngredientEditorValue {
  id: string;
  catalogId?: string;
  canonicalName?: string;
  dimension?: IngredientAmount["dimension"];
  name: string;
  quantity: string;
  unit: string;
  unitTouched?: boolean;
  aisle?: GroceryAisle;
  aliases?: string[];
  saveToCatalog?: boolean;
}

interface OpenRouterSetupNotice {
  error: string;
  missingVariables?: string[];
  railwayHint?: string;
}

function emptyIngredient(): IngredientEditorValue {
  return {
    id: crypto.randomUUID(),
    name: "",
    quantity: "",
    unit: "count",
    saveToCatalog: true
  };
}

function resolveEditorIngredient(
  ingredient: IngredientEditorValue,
  suggestions: ReturnType<typeof mergedIngredientCatalog>
): IngredientEditorValue {
  const resolved = resolveIngredientInput(ingredient.name, suggestions);
  const currentUnit = resolveUnitInput(ingredient.unit);
  const shouldUseSuggestionUnit =
    !ingredient.unitTouched && Boolean(resolved.suggestion);
  const nextUnit = shouldUseSuggestionUnit
    ? resolved.defaultUnit
    : currentUnit.unit;
  const nextUnitResolution = resolveUnitInput(nextUnit);

  return {
    ...ingredient,
    name: resolved.displayName,
    canonicalName: resolved.canonicalName,
    catalogId:
      resolved.suggestion?.source === "household"
        ? resolved.suggestion.id
        : undefined,
    unit: nextUnitResolution.unit,
    unitTouched: ingredient.unitTouched,
    dimension: shouldUseSuggestionUnit
      ? resolved.dimension
      : nextUnitResolution.dimension,
    aisle: resolved.aisle,
    aliases: resolved.aliases,
    saveToCatalog: resolved.suggestion
      ? true
      : ingredient.saveToCatalog ?? true
  };
}

function RecipeEditorModal({
  open,
  recipeId,
  onClose,
  notify
}: {
  open: boolean;
  recipeId?: string | null;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const { state, addRecipe, updateRecipe } = useAppStore();
  const editingRecipe = recipeId
    ? state.recipes.find((candidate) => candidate.id === recipeId)
    : undefined;
  const isEditing = Boolean(editingRecipe);
  const [mode, setMode] = useState<"manual" | "import">("manual");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [yieldCount, setYieldCount] = useState("4");
  const [prepMinutes, setPrepMinutes] = useState("15");
  const [cookMinutes, setCookMinutes] = useState("30");
  const [quickCook, setQuickCook] = useState(false);
  const [ingredients, setIngredients] = useState<IngredientEditorValue[]>([
    emptyIngredient(),
    emptyIngredient()
  ]);
  const [instructions, setInstructions] = useState([""]);
  const [importText, setImportText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [modelId, setModelId] = useState(state.household.aiModelId ?? "");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSetup, setImportSetup] =
    useState<OpenRouterSetupNotice | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const ingredientSuggestions = useMemo(
    () => mergedIngredientCatalog(state.ingredientCatalog),
    [state.ingredientCatalog]
  );

  const reset = useCallback(() => {
    setMode("manual");
    setTitle("");
    setDescription("");
    setSourceUrl("");
    setYieldCount("4");
    setPrepMinutes("15");
    setCookMinutes("30");
    setQuickCook(false);
    setIngredients([emptyIngredient(), emptyIngredient()]);
    setInstructions([""]);
    setImportText("");
    setImages([]);
    setModelId(state.household.aiModelId ?? "");
    setImportSetup(null);
    setWarnings([]);
  }, [state.household.aiModelId]);

  const populateFromRecipe = useCallback((recipe: Recipe) => {
    const version = currentRecipeVersion(recipe);
    setMode("manual");
    setTitle(recipe.title);
    setDescription(recipe.description);
    setSourceUrl(recipe.sourceUrl ?? "");
    setYieldCount(String(version.yield || 4));
    setPrepMinutes(String(recipe.prepMinutes || 0));
    setCookMinutes(String(recipe.cookMinutes || 0));
    setQuickCook(recipeLabels(recipe).includes("Quick Cook"));
    setIngredients(
      version.ingredients.map((ingredient) => ({
        id: ingredient.id || crypto.randomUUID(),
        name: ingredient.name,
        canonicalName: ingredient.canonicalName,
        quantity:
          ingredient.quantity === null ? "" : String(ingredient.quantity),
        unit: ingredient.unit,
        unitTouched: true,
        catalogId: ingredient.catalogId,
        dimension: ingredient.dimension,
        aisle: ingredient.aisle,
        aliases: ingredient.aliases,
        saveToCatalog: ingredient.saveToCatalog ?? true
      }))
    );
    setInstructions(version.instructions.length ? version.instructions : [""]);
    setImportText("");
    setImages([]);
    setModelId(state.household.aiModelId ?? "");
    setImportSetup(null);
    setWarnings([]);
  }, [state.household.aiModelId]);

  useEffect(() => {
    if (!open) return;
    if (editingRecipe) {
      populateFromRecipe(editingRecipe);
    } else {
      reset();
    }
  }, [editingRecipe, open, populateFromRecipe, reset]);

  useEffect(() => {
    if (
      isEditing ||
      !open ||
      mode !== "import" ||
      models.length ||
      modelsLoading
    ) {
      return;
    }
    setModelsLoading(true);
    void fetch("/api/ai/models")
      .then(async (response) => {
        const result = (await response.json()) as {
          models?: AiModelOption[];
          error?: string;
          setupRequired?: boolean;
          missingVariables?: string[];
          railwayHint?: string;
        };
        if (!response.ok) {
          if (result.setupRequired) {
            setImportSetup({
              error: result.error ?? "OpenRouter setup is incomplete.",
              missingVariables: result.missingVariables,
              railwayHint: result.railwayHint
            });
            return;
          }
          throw new Error(result.error);
        }
        setImportSetup(null);
        setModels(result.models ?? []);
      })
      .catch((error) =>
        notify(
          error instanceof Error
            ? error.message
            : "OpenRouter models could not be loaded."
        )
      )
      .finally(() => setModelsLoading(false));
  }, [isEditing, mode, models.length, modelsLoading, notify, open]);

  async function addScreenshots(files: FileList | null) {
    if (!files) return;
    const selected = Array.from(files).slice(0, 4);
    const encoded = await Promise.all(
      selected.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          })
      )
    );
    setImages(encoded);
  }

  async function analyzeImport() {
    if (!sourceUrl && !importText && images.length === 0) {
      notify("Paste a recipe link, recipe text, or add a screenshot first.");
      return;
    }
    setImporting(true);
    try {
      const response = await fetch("/api/recipe-imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: sourceUrl || undefined,
          text: importText,
          images,
          modelId: modelId || undefined
        })
      });
      if (!response.ok) {
        const result = (await response.json()) as {
          error?: string;
          setupRequired?: boolean;
          missingVariables?: string[];
          railwayHint?: string;
        };
        if (result.setupRequired) {
          setImportSetup({
            error: result.error ?? "OpenRouter setup is incomplete.",
            missingVariables: result.missingVariables,
            railwayHint: result.railwayHint
          });
        }
        throw new Error(result.error ?? "Import failed");
      }
      setImportSetup(null);
      const draft = (await response.json()) as {
        title: string;
        description: string;
        sourceUrl?: string;
        yield: number;
        prepMinutes: number;
        cookMinutes: number;
        tags: string[];
        ingredients: IngredientAmount[];
        instructions: string[];
        warnings: string[];
      };
      setTitle(draft.title);
      setDescription(draft.description);
      setSourceUrl(draft.sourceUrl ?? sourceUrl);
      setYieldCount(String(draft.yield || 4));
      setPrepMinutes(String(draft.prepMinutes || 0));
      setCookMinutes(String(draft.cookMinutes || 0));
      setQuickCook(
        draft.tags.some((tag) => tag.toLowerCase() === "quick cook")
      );
      setIngredients(
        draft.ingredients.map((ingredient) => ({
          id: ingredient.id || crypto.randomUUID(),
          name: ingredient.name,
          canonicalName: ingredient.canonicalName,
          quantity:
            ingredient.quantity === null ? "" : String(ingredient.quantity),
          unit: ingredient.unit,
          unitTouched: true,
          catalogId: ingredient.catalogId,
          dimension: ingredient.dimension,
          aisle: ingredient.aisle,
          aliases: ingredient.aliases,
          saveToCatalog: true
        }))
      );
      setInstructions(draft.instructions.length ? draft.instructions : [""]);
      setWarnings(draft.warnings);
      setMode("manual");
      notify("Draft extracted. Review every field before saving.");
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "I could not read that recipe. Try pasting the caption or text."
      );
    } finally {
      setImporting(false);
    }
  }

  async function saveRecipe() {
    const parsedIngredients = ingredients
      .filter((ingredient) => ingredient.name.trim())
      .map((ingredient) =>
        resolveEditorIngredient(ingredient, ingredientSuggestions)
      )
      .map((ingredient) => {
        const unitResolution = resolveUnitInput(ingredient.unit);
        const normalized = normalizeUnit(unitResolution.unit);
        const parsed = parseQuantity(ingredient.quantity);
        const base = createIngredient(
          ingredient.id,
          ingredient.name.trim(),
          parsed,
          unitResolution.unit
        );
        return {
          ...base,
          catalogId: ingredient.catalogId,
          saveToCatalog: ingredient.saveToCatalog ?? true,
          canonicalName: ingredient.canonicalName ?? base.canonicalName,
          dimension: ingredient.dimension ?? normalized.dimension,
          aisle: ingredient.aisle ?? inferAisle(ingredient.name),
          aliases: ingredient.aliases ?? []
        };
      });
    if (!title.trim() || parsedIngredients.length === 0) {
      notify("Add a title and at least one ingredient.");
      return;
    }
    const recipePayload = {
      title: title.trim(),
      description: description.trim(),
      sourceUrl: sourceUrl.trim() || undefined,
      sourceCreator: editingRecipe?.sourceCreator ?? state.household.name,
      imageUrl: undefined,
      prepMinutes: Number(prepMinutes) || 0,
      cookMinutes: Number(cookMinutes) || 0,
      tags: recipeTagsForSave(quickCook),
      favorite: editingRecipe?.favorite ?? false,
      visibility: editingRecipe?.visibility ?? "private",
      yield: Number(yieldCount) || 4,
      ingredients: parsedIngredients,
      instructions: instructions.map((step) => step.trim()).filter(Boolean)
    };
    const saved =
      editingRecipe && recipeId
        ? await updateRecipe(recipeId, recipePayload)
        : await addRecipe(recipePayload);
    if (!saved) {
      notify("The recipe could not be saved.");
      return;
    }
    notify(
      editingRecipe
        ? `${title.trim()} updated.`
        : `${title.trim()} added to the household recipe box.`
    );
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      title={isEditing ? "Edit recipe" : "Add a recipe"}
      eyebrow="Recipe Book"
      onClose={() => {
        reset();
        onClose();
      }}
      wide
    >
      {!isEditing ? (
        <SegmentedControl
          value={mode}
          options={[
            { value: "manual", label: "Enter manually" },
            { value: "import", label: "Import with AI" }
          ]}
          onChange={setMode}
        />
      ) : null}

      {!isEditing && mode === "import" ? (
        <div className="form-grid import-panel">
          <div className="import-callout">
            <Sparkles size={22} />
            <div>
              <strong>Make a draft, not a guess</strong>
              <p>
                Paste a recipe page, TikTok link, caption, or transcript. The
                result always comes back here for review.
              </p>
            </div>
          </div>
          {importSetup ? (
            <div className="warning-list import-setup-callout">
              <CircleAlert size={19} />
              <div>
                <strong>OpenRouter setup needed</strong>
                <p>{importSetup.error}</p>
                {importSetup.missingVariables?.length ? (
                  <p>
                    Missing:{" "}
                    <code>{importSetup.missingVariables.join(", ")}</code>
                  </p>
                ) : null}
                {importSetup.railwayHint ? (
                  <p>{importSetup.railwayHint}</p>
                ) : null}
              </div>
            </div>
          ) : null}
          <label>
            Recipe or social link
            <input
              type="url"
              placeholder="https://…"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
            />
          </label>
          <label>
            Caption, transcript, or recipe text
            <textarea
              placeholder="Paste everything you have. Messy is fine."
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
            />
          </label>
          <label>
            OpenRouter model
            <input
              list="openrouter-models"
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
              placeholder={
                modelsLoading
                  ? "Loading compatible models..."
                  : "Use app default"
              }
            />
            <datalist id="openrouter-models">
              {models.map((model) => (
                <option value={model.id} key={model.id}>
                  {model.name}
                  {model.supportsImages ? " · images" : ""}
                </option>
              ))}
            </datalist>
            <span className="field-note">
              Leave blank to use the app default, or search the catalog to
              temporarily override this import.
            </span>
          </label>
          <label className="upload-placeholder">
            Screenshots
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(event) => void addScreenshots(event.target.files)}
            />
            <span>
              {images.length
                ? `${images.length} screenshot${images.length === 1 ? "" : "s"} ready`
                : "Optional for now. Text and recipe links are the first production-ready import path."}
            </span>
          </label>
          <button
            className="primary-button"
            type="button"
            onClick={analyzeImport}
            disabled={importing}
          >
            {importing ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Sparkles size={18} />
            )}
            Build recipe draft
          </button>
        </div>
      ) : (
        <div className="form-grid recipe-editor">
          {warnings.length ? (
            <div className="warning-list">
              <CircleAlert size={19} />
              <div>
                <strong>Please review</strong>
                {warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            </div>
          ) : null}
          <label>
            Recipe name
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Sunday sauce"
            />
          </label>
          <label>
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What makes this one worth remembering?"
            />
          </label>
          <div className="form-two">
            <label>
              Makes
              <input
                type="number"
                min={1}
                value={yieldCount}
                onChange={(event) => setYieldCount(event.target.value)}
              />
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={quickCook}
                onChange={(event) => setQuickCook(event.target.checked)}
              />
              Quick Cook
            </label>
          </div>
          <div>
            <div className="subsection-header">
              <h3>Ingredients</h3>
              <button
                className="ghost-button"
                type="button"
                onClick={() =>
                  setIngredients((current) => [
                    ...current,
                    emptyIngredient()
                  ])
                }
              >
                <Plus size={15} /> Add
              </button>
            </div>
            <div className="form-grid compact-grid">
              {ingredients.map((ingredient) => {
                const resolvedIngredient = resolveIngredientInput(
                  ingredient.name,
                  ingredientSuggestions
                );
                const isCustom =
                  Boolean(ingredient.name.trim()) &&
                  !resolvedIngredient.suggestion;
                return (
                  <div className="ingredient-editor-item" key={ingredient.id}>
                    <div className="ingredient-editor-row">
                      <input
                        value={ingredient.quantity}
                        placeholder="Qty"
                        onChange={(event) =>
                          setIngredients((current) =>
                            current.map((candidate) =>
                              candidate.id === ingredient.id
                                ? {
                                    ...candidate,
                                    quantity: event.target.value
                                  }
                                : candidate
                            )
                          )
                        }
                      />
                      <UnitInput
                        listId={`unit-options-${ingredient.id}`}
                        value={ingredient.unit}
                        onChange={(unit, dimension) => {
                          setIngredients((current) =>
                            current.map((candidate) =>
                              candidate.id === ingredient.id
                                ? {
                                    ...candidate,
                                    unit,
                                    dimension,
                                    unitTouched: true
                                  }
                                : candidate
                            )
                          );
                        }}
                      />
                      <input
                        list={`ingredient-catalog-${ingredient.id}`}
                        value={ingredient.name}
                        placeholder="Ingredient"
                        onChange={(event) => {
                          const name = event.target.value;
                          setIngredients((current) =>
                            current.map((candidate) =>
                              candidate.id === ingredient.id
                                ? {
                                    ...candidate,
                                    name,
                                    canonicalName: undefined,
                                    catalogId: undefined,
                                    aisle: undefined,
                                    aliases: undefined
                                  }
                                : candidate
                            )
                          );
                        }}
                        onBlur={() =>
                          setIngredients((current) =>
                            current.map((candidate) =>
                              candidate.id === ingredient.id
                                ? resolveEditorIngredient(
                                    candidate,
                                    ingredientSuggestions
                                  )
                                : candidate
                            )
                          )
                        }
                      />
                      <datalist id={`ingredient-catalog-${ingredient.id}`}>
                        {searchIngredientSuggestions(
                          ingredientSuggestions,
                          ingredient.name
                        ).map((entry) => (
                          <option
                            value={entry.displayName}
                            key={entry.id}
                          >
                            {entry.defaultUnit === "count"
                              ? "each"
                              : entry.defaultUnit}
                          </option>
                        ))}
                      </datalist>
                      <button
                        className="mini-button"
                        type="button"
                        aria-label="Remove ingredient"
                        onClick={() =>
                          setIngredients((current) =>
                            current.filter(
                              (candidate) => candidate.id !== ingredient.id
                            )
                          )
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {isCustom ? (
                      <label className="inline-check ingredient-save-check">
                        <input
                          type="checkbox"
                          checked={ingredient.saveToCatalog ?? true}
                          onChange={(event) =>
                            setIngredients((current) =>
                              current.map((candidate) =>
                                candidate.id === ingredient.id
                                  ? {
                                      ...candidate,
                                      saveToCatalog: event.target.checked
                                    }
                                  : candidate
                              )
                            )
                          }
                        />
                        Save &quot;{ingredient.name}&quot; to household suggestions
                      </label>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="subsection-header">
              <h3>Instructions</h3>
              <button
                className="ghost-button"
                type="button"
                onClick={() =>
                  setInstructions((current) => [...current, ""])
                }
              >
                <Plus size={15} /> Add
              </button>
            </div>
            <div className="form-grid compact-grid">
              {instructions.map((instruction, index) => (
                <div className="instruction-editor-row" key={index}>
                  <span className="instruction-number">{index + 1}</span>
                  <textarea
                    value={instruction}
                    placeholder="Describe this step"
                    onChange={(event) =>
                      setInstructions((current) =>
                        current.map((step, stepIndex) =>
                          stepIndex === index ? event.target.value : step
                        )
                      )
                    }
                  />
                  <button
                    className="mini-button"
                    type="button"
                    aria-label="Remove instruction"
                    onClick={() =>
                      setInstructions((current) =>
                        current.filter((_, stepIndex) => stepIndex !== index)
                      )
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="recipe-extra-section">
            <div className="subsection-header">
              <h3>Source</h3>
            </div>
            <label>
              Source link
              <input
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="Optional"
              />
            </label>
            <p className="field-note">
              Sharing and community publishing live in the recipe&apos;s Share
              button after it is saved.
            </p>
          </div>

          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={saveRecipe}
            >
              {isEditing ? "Save changes" : "Save recipe"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function RecipeDetailModal({
  recipeId,
  onClose,
  notify
}: {
  recipeId: string | null;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const {
    state,
    refresh,
    removeRecipe,
    restoreRecipeVersion
  } = useAppStore();
  const [shareOpen, setShareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const recipe = state.recipes.find((candidate) => candidate.id === recipeId);
  if (!recipe) {
    return (
      <Modal open={false} title="Recipe" onClose={onClose}>
        {null}
      </Modal>
    );
  }
  const version = currentRecipeVersion(recipe);
  const imageUrl = realRecipeImage(recipe);
  const originalSource =
    recipe.sourceCreator &&
    recipe.sourceCreator !== recipe.attributionHousehold
      ? recipe.sourceCreator
      : undefined;
  return (
    <Modal open title={recipe.title} eyebrow="Household recipe" onClose={onClose}>
      {imageUrl ? (
        <div
          className="recipe-hero"
          style={{ backgroundImage: `url("${imageUrl}")` }}
        />
      ) : null}
      <p>{recipe.description}</p>
      <div className="tag-row">
        {[...recipeLabels(recipe), recipeSourceLabel(recipe)]
          .filter(Boolean)
          .map((tag) => (
          <span className="tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <div className="recipe-detail-meta">
        <div>
          <strong>{version.yield}</strong>
          <span>Makes</span>
        </div>
      </div>
      {recipe.attributionHousehold ? (
        <p className="field-note">
          Shared by {recipe.attributionHousehold}
          {originalSource ? ` · Original source: ${originalSource}` : ""}
        </p>
      ) : null}
      <div className="subsection-header">
        <h3>Ingredients</h3>
      </div>
      <ul className="ingredient-list">
        {version.ingredients.map((ingredient) => (
          <li key={ingredient.id}>
            <span>{formatIngredientLine(ingredient)}</span>
          </li>
        ))}
      </ul>
      <div className="subsection-header">
        <h3>Method</h3>
      </div>
      <ol className="instruction-list">
        {version.instructions.map((instruction) => (
          <li key={instruction}>{instruction}</li>
        ))}
      </ol>
      {recipe.versions.length > 1 ? (
        <div className="version-note">
          <RotateCcw size={16} />
          <div className="row-main">
            <strong>Recipe history</strong>
            <span>
              This recipe has previous saved edits. Restoring creates another
              saved edit, so no history is deleted.
            </span>
          </div>
          <button
            className="secondary-button"
            onClick={() => {
              restoreRecipeVersion(recipe.id, recipe.currentVersion - 1);
              notify("Previous recipe version queued for restoration.");
              onClose();
            }}
          >
            Restore previous
          </button>
        </div>
      ) : null}
      {recipe.updateAvailable ? (
        <div className="proposal-callout">
          <Download size={20} />
          <div className="row-main">
            <strong>Source update available</strong>
            <p>
              Applying it creates a new local version. Your current version
              remains in history for rollback.
            </p>
          </div>
          <button
            className="primary-button"
            disabled={updating}
            onClick={async () => {
              setUpdating(true);
              const updateResponse = await fetch("/api/recipe-updates");
              const updateResult = (await updateResponse.json()) as {
                updates?: Array<{
                  originId: string;
                  recipeId: string;
                  revisionId: string;
                }>;
                error?: string;
              };
              const update = updateResult.updates?.find(
                (candidate) => candidate.recipeId === recipe.id
              );
              if (!update) {
                notify(updateResult.error ?? "The update is no longer available.");
                setUpdating(false);
                return;
              }
              const response = await fetch("/api/recipe-updates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  originId: update.originId,
                  revisionId: update.revisionId
                })
              });
              const result = (await response.json()) as { error?: string };
              if (response.ok) {
                await refresh();
                notify("The source update was saved as a new recipe version.");
                onClose();
              } else {
                notify(result.error ?? "The update could not be applied.");
              }
              setUpdating(false);
            }}
          >
            {updating ? <LoaderCircle className="spin" size={16} /> : null}
            Apply update
          </button>
        </div>
      ) : null}
      <div className="form-actions">
        <button
          className="danger-button"
          type="button"
          onClick={async () => {
            if (!window.confirm(`Delete ${recipe.title}?`)) return;
            const deleted = await removeRecipe(recipe.id);
            if (deleted) {
              notify(`${recipe.title} deleted.`);
              onClose();
            }
          }}
        >
          <Trash2 size={16} /> Delete
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => setEditOpen(true)}
        >
          <Pencil size={16} /> Edit
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => setShareOpen(true)}
        >
          <Share2 size={16} /> Share
        </button>
      </div>
      <RecipeShareModal
        recipe={recipe}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        notify={notify}
      />
      <RecipeEditorModal
        open={editOpen}
        recipeId={recipe.id}
        onClose={() => setEditOpen(false)}
        notify={notify}
      />
    </Modal>
  );
}

interface PrivateRecipeShare {
  id: string;
  recipient_email: string;
  active: boolean;
  accepted_at: string | null;
}

function RecipeShareModal({
  recipe,
  open,
  onClose,
  notify
}: {
  recipe: Recipe;
  open: boolean;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const { setRecipeVisibility } = useAppStore();
  const [shareEmail, setShareEmail] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [sharing, setSharing] = useState(false);
  const [privateShares, setPrivateShares] = useState<PrivateRecipeShare[]>([]);

  useEffect(() => {
    if (!open) return;
    void fetch(`/api/recipe-invitations?recipeId=${recipe.id}`)
      .then(async (response) => {
        if (!response.ok) return;
        const result = (await response.json()) as {
          shares?: PrivateRecipeShare[];
        };
        setPrivateShares(result.shares ?? []);
      })
      .catch(() => undefined);
  }, [open, recipe.id]);

  async function sharePrivately() {
    if (!shareEmail.includes("@")) {
      notify("Enter the email address for the person you want to share with.");
      return;
    }
    setSharing(true);
    const response = await fetch("/api/recipe-invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipeId: recipe.id,
        email: shareEmail
      })
    });
    const result = (await response.json()) as {
      shareId?: string;
      inviteUrl?: string;
      emailSent?: boolean;
      emailError?: string;
      error?: string;
    };
    if (response.ok && result.inviteUrl) {
      setShareUrl(result.inviteUrl);
      if (result.shareId) {
        setPrivateShares((current) => [
          {
            id: result.shareId!,
            recipient_email: shareEmail,
            active: true,
            accepted_at: null
          },
          ...current
        ]);
      }
      notify(
        result.emailSent
          ? "Private recipe invitation emailed."
          : result.emailError
            ? "Private recipe link prepared. Email could not be sent automatically."
            : "Private recipe invitation link prepared."
      );
      setShareEmail("");
    } else {
      notify(result.error ?? "The invitation could not be created.");
    }
    setSharing(false);
  }

  return (
    <Modal
      open={open}
      title={`Share ${recipe.title}`}
      eyebrow="Recipe sharing"
      onClose={onClose}
      wide
    >
      <div className="settings-card card">
        <Globe2 size={20} color="#315c4a" />
        <h3>Community discovery</h3>
        <p>
          {recipe.visibility === "public"
            ? "Signed-in Gather & Graze households can discover and copy this recipe."
            : "Only your household can see this recipe unless you share it directly."}
        </p>
        <button
          className="secondary-button"
          onClick={() => {
            const visibility =
              recipe.visibility === "public" ? "private" : "public";
            setRecipeVisibility(recipe.id, visibility);
            notify(
              visibility === "public"
                ? "Recipe published to the community library."
                : "Recipe removed from community discovery."
            );
          }}
        >
          {recipe.visibility === "public" ? "Make private" : "Publish recipe"}
        </button>
      </div>

      <div className="settings-card card">
        <Share2 size={20} color="#315c4a" />
        <h3>Private link</h3>
        <p>
          Send an email-bound invitation that creates an independent copy in the
          recipient&apos;s household.
        </p>
        <div className="invite-row">
          <input
            type="email"
            value={shareEmail}
            onChange={(event) => setShareEmail(event.target.value)}
            placeholder="friend@example.com"
          />
          <button
            className="primary-button"
            disabled={sharing}
            onClick={sharePrivately}
          >
            {sharing ? <LoaderCircle className="spin" size={16} /> : "Share"}
          </button>
        </div>
        {shareUrl ? <input value={shareUrl} readOnly /> : null}
        {privateShares
          .filter((share) => share.active)
          .map((share) => (
            <div className="member-row" key={share.id}>
              <div className="row-main">
                <strong>{share.recipient_email}</strong>
                <span>
                  {share.accepted_at
                    ? "Copy accepted · future updates enabled"
                    : "Invitation pending"}
                </span>
              </div>
              <button
                className="danger-button"
                onClick={async () => {
                  const response = await fetch(
                    `/api/recipe-invitations/${share.id}/revoke`,
                    { method: "POST" }
                  );
                  if (response.ok) {
                    setPrivateShares((current) =>
                      current.map((candidate) =>
                        candidate.id === share.id
                          ? { ...candidate, active: false }
                          : candidate
                      )
                    );
                    notify("Private sharing and future updates revoked.");
                  } else {
                    notify("The private share could not be revoked.");
                  }
                }}
              >
                Revoke
              </button>
            </div>
          ))}
      </div>
    </Modal>
  );
}

type CommunityRecipe = SharedRecipeSnapshot & {
  id: string;
  currentVersion: number;
  createdAt: string;
};

function CommunityRecipeModal({
  open,
  onClose,
  notify
}: {
  open: boolean;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const { state, refresh } = useAppStore();
  const [recipes, setRecipes] = useState<CommunityRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const ownPublicRecipes = state.recipes.filter(
    (recipe) =>
      recipe.visibility === "public" &&
      recipeSourceType(recipe) === "public-owned"
  );

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void fetch("/api/community-recipes")
      .then(async (response) => {
        const result = (await response.json()) as {
          recipes?: CommunityRecipe[];
          error?: string;
        };
        if (!response.ok) throw new Error(result.error);
        setRecipes(result.recipes ?? []);
      })
      .catch((error) =>
        notify(
          error instanceof Error
            ? error.message
            : "The community library could not be loaded."
        )
      )
      .finally(() => setLoading(false));
  }, [notify, open]);

  return (
    <Modal
      open={open}
      title="Community recipes"
      eyebrow="Gather & Graze"
      onClose={onClose}
      wide
    >
      {loading ? (
        <div className="app-loading">
          <LoaderCircle className="spin" />
          <span>Loading shared recipes...</span>
        </div>
      ) : ownPublicRecipes.length || recipes.length ? (
        <>
          {ownPublicRecipes.length ? (
            <>
              <div className="section-title compact">
                <div>
                  <p className="eyebrow">Published by you</p>
                  <h3>Your public recipes</h3>
                </div>
              </div>
              <div className="list-stack">
                {ownPublicRecipes.map((recipe) => (
                  <article className="pantry-row card" key={recipe.id}>
                    <Globe2 size={20} color="#315c4a" />
                    <div className="row-main">
                      <strong>{recipe.title}</strong>
                      <span>Public in your Recipe Book</span>
                    </div>
                    <span className="tag">Already yours</span>
                  </article>
                ))}
              </div>
            </>
          ) : null}
          {recipes.length ? (
            <>
              <div className="section-title compact">
                <div>
                  <p className="eyebrow">From other households</p>
                  <h3>Community recipes</h3>
                </div>
              </div>
              <div className="list-stack">
                {recipes.map((recipe) => (
                  <article className="pantry-row card" key={recipe.id}>
                    <Globe2 size={20} color="#315c4a" />
                    <div className="row-main">
                      <strong>{recipe.title}</strong>
                      <span>Shared by {recipe.attributionHousehold}</span>
                    </div>
                    <button
                      className="primary-button"
                      onClick={async () => {
                        const response = await fetch("/api/community-recipes", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ recipeId: recipe.id })
                        });
                        const result = (await response.json()) as {
                          error?: string;
                        };
                        if (!response.ok) {
                          notify(
                            result.error ?? "The recipe could not be copied."
                          );
                          return;
                        }
                        await refresh();
                        notify(`${recipe.title} copied to your household.`);
                        onClose();
                      }}
                    >
                      <Download size={15} /> Save copy
                    </button>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : (
        <EmptyState
          title="No public recipes yet"
          body="Publish one from a recipe's Share button, or check back for recipes from other households."
        />
      )}
    </Modal>
  );
}

function PantryScreen({ notify }: { notify: (message: string) => void }) {
  const { state, removePantryItem } = useAppStore();
  const [query, setQuery] = useState("");
  const [editId, setEditId] = useState<string | "new" | null>(null);
  const filtered = state.pantry.filter((item) =>
    item.name.toLowerCase().includes(query.toLowerCase())
  );
  const exact = state.pantry.filter((item) => item.quantity !== null).length;
  const unknown = state.pantry.filter((item) => item.quantity === null).length;
  const confirm = state.pantry.filter((item) => item.needsConfirmation).length;

  return (
    <>
      <div className="screen-header">
        <div>
          <p className="eyebrow">Shared household stock</p>
          <h1>Pantry</h1>
          <p>
            Keep a practical memory of what is already home, exact when useful
            and approximate when life happens.
          </p>
        </div>
        <button className="primary-button" onClick={() => setEditId("new")}>
          <Plus size={17} />
          <span className="header-cta-label">Add item</span>
        </button>
      </div>

      <div className="pantry-summary">
        <div className="metric-card card">
          <strong>{exact}</strong>
          <span>Measured</span>
        </div>
        <div className="metric-card card">
          <strong>{unknown}</strong>
          <span>In stock</span>
        </div>
        <div className="metric-card card">
          <strong>{confirm}</strong>
          <span>Check soon</span>
        </div>
      </div>

      <div className="search-row">
        <div className="search-input-wrap">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pantry"
          />
        </div>
      </div>

      <div className="list-stack">
        {filtered.map((item) => (
          <article className="pantry-row card" key={item.id}>
            <button
              className="row-main"
              type="button"
              onClick={() => setEditId(item.id)}
            >
              <strong>{item.name}</strong>
              <span>{quantityLabel(item.quantity, item.unit)}</span>
            </button>
            {item.needsConfirmation ? (
              <span className="confirmation-flag">Check amount</span>
            ) : null}
            <button
              className="mini-button"
              aria-label={`Edit ${item.name}`}
              onClick={() => setEditId(item.id)}
            >
              <Pencil size={14} />
            </button>
            <button
              className="mini-button"
              aria-label={`Remove ${item.name}`}
              onClick={() => {
                removePantryItem(item.id);
                notify(`${item.name} removed from pantry.`);
              }}
            >
              <Trash2 size={14} />
            </button>
          </article>
        ))}
      </div>
      <PantryItemModal
        itemId={editId}
        onClose={() => setEditId(null)}
        notify={notify}
      />
    </>
  );
}

function PantryItemModal({
  itemId,
  onClose,
  notify
}: {
  itemId: string | "new" | null;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const { state, upsertPantryItem } = useAppStore();
  const item =
    itemId && itemId !== "new"
      ? state.pantry.find((candidate) => candidate.id === itemId)
      : undefined;
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("count");
  const [known, setKnown] = useState<"exact" | "unknown">("exact");

  useEffect(() => {
    if (!itemId) return;
    setName(item?.name ?? "");
    setQuantity(item?.quantity === null ? "" : String(item?.quantity ?? ""));
    setUnit(item?.unit ?? "count");
    setKnown(item?.quantity === null ? "unknown" : "exact");
  }, [itemId, item]);

  function save() {
    if (!name.trim()) {
      notify("Give the pantry item a name.");
      return;
    }
    upsertPantryItem({
      id: item?.id,
      name: name.trim(),
      quantity: known === "unknown" ? null : parseQuantity(quantity),
      unit: unit.trim() || "count"
    });
    notify(`${name.trim()} saved in pantry.`);
    onClose();
  }

  return (
    <Modal
      open={Boolean(itemId)}
      title={item ? `Update ${item.name}` : "Add pantry item"}
      eyebrow="Household pantry"
      onClose={onClose}
    >
      <div className="form-grid">
        <label>
          Item
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Yellow onion"
          />
        </label>
        <SegmentedControl
          value={known}
          options={[
            { value: "exact", label: "I know the amount" },
            { value: "unknown", label: "Just mark in stock" }
          ]}
          onChange={setKnown}
        />
        {known === "exact" ? (
          <div className="form-two">
            <label>
              Quantity
              <input
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="1 or 1/2"
              />
            </label>
            <label>
              Unit
              <UnitInput
                listId="pantry-unit-options"
                value={unit}
                onChange={(nextUnit) => setUnit(nextUnit)}
              />
            </label>
          </div>
        ) : null}
        <div className="form-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" onClick={save}>
            Save item
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ShoppingScreen({ notify }: { notify: (message: string) => void }) {
  const {
    state,
    generateList,
    toggleShoppingItem,
    addShoppingItem,
    removeShoppingItem,
    upsertPantryItem
  } = useAppStore();
  const [manualName, setManualName] = useState("");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const selectedWeekRange = formatWeekRange(state.weeklyPlan.weekStart);
  const review = useMemo(
    () =>
      buildPantryReview(state.weeklyPlan, state.recipes, state.pantry),
    [state.weeklyPlan, state.recipes, state.pantry]
  );
  const unresolved = review.filter((line) => line.unresolved);
  const list = state.shoppingList;
  const listMatchesSelectedWeek =
    !list || list.weeklyPlanId === state.weeklyPlan.id;
  const checked = list?.items.filter((item) => item.checked).length ?? 0;
  const total = list?.items.length ?? 0;
  const shoppingItems = list?.items ?? [];

  if (!list || list.stale) {
    return (
      <>
        <div className="screen-header">
          <div>
            <p className="eyebrow">Shopping for {selectedWeekRange}</p>
            <h1>Pantry check</h1>
            <p>
              We combined this planning week’s recipes. Confirm what is already
              home, then generate only what you need.
            </p>
          </div>
        </div>

        {list?.stale ? (
          <div className="alert-card card">
            <CircleAlert size={21} color="#d97d54" />
            <div className="row-main">
              <strong>Your plan or pantry changed</strong>
              <p>
                Regenerate to update quantities. Checked and manual items stay
                with you.
              </p>
            </div>
          </div>
        ) : null}

        <div className="pantry-review-summary">
          {review.map((line) => (
            <article
              className={`review-row card ${line.unresolved ? "unresolved" : ""}`}
              key={`${line.canonicalName}:${line.unit}`}
            >
              <div className="row-main">
                <strong>{line.name}</strong>
                <div className="review-amounts">
                  <span>
                    Need{" "}
                    <strong>
                      {formatIngredientAmount({
                        quantity: line.requiredQuantity,
                        unit: line.unit
                      })}
                    </strong>
                  </span>
                  <span>
                    Have{" "}
                    <strong>
                      {line.availableQuantity === null
                        ? "unknown"
                        : formatIngredientAmount({
                            quantity: line.availableQuantity,
                            unit: line.unit
                          })}
                    </strong>
                  </span>
                </div>
              </div>
              {line.unresolved ? (
                <button
                  className="secondary-button"
                  onClick={() => {
                    upsertPantryItem({
                      name: line.name,
                      quantity: line.requiredQuantity,
                      unit: line.unit
                    });
                    notify(`${line.name}: confirmed enough for this plan.`);
                  }}
                >
                  Enough
                </button>
              ) : line.allocatedQuantity ? (
                <span className="cooked-badge">
                  <Check size={11} /> Pantry covers{" "}
                  {formatIngredientAmount({
                    quantity: line.allocatedQuantity,
                    unit: line.unit
                  })}
                </span>
              ) : null}
            </article>
          ))}
        </div>

        {!review.length ? (
          <EmptyState
            title="Plan a dinner first"
            body="Recipe ingredients will appear here before the shopping list is generated."
          />
        ) : (
          <div className="generation-card card">
            <div>
              <strong>
                {unresolved.length
                  ? `${unresolved.length} pantry amount${unresolved.length === 1 ? "" : "s"} need a decision`
                  : "Pantry review complete"}
              </strong>
              <p>
                Unknown stock is never silently assumed. Confirm enough or set
                an exact quantity.
              </p>
            </div>
            <button
              className="primary-button"
              disabled={unresolved.length > 0}
              onClick={() => {
                setGenerateOpen(true);
              }}
            >
              <ShoppingBasket size={17} />
              {list ? "Regenerate list" : "Generate list"}
            </button>
          </div>
        )}
        <GenerateShoppingListModal
          open={generateOpen}
          weekRange={selectedWeekRange}
          regenerating={Boolean(list)}
          onClose={() => setGenerateOpen(false)}
          onConfirm={() => {
            generateList();
            notify(`Shopping list generated for ${selectedWeekRange}.`);
            setGenerateOpen(false);
          }}
        />
      </>
    );
  }

  return (
    <>
      <div className="screen-header">
        <div>
          <p className="eyebrow">Shopping for {selectedWeekRange}</p>
          <h1>Shopping list</h1>
          <p>Check it on either phone. This list belongs to the selected week.</p>
        </div>
      </div>

      {!listMatchesSelectedWeek ? (
        <div className="alert-card card">
          <CircleAlert size={21} color="#d97d54" />
          <div className="row-main">
            <strong>This list belongs to a different week</strong>
            <p>Switch weeks or regenerate before shopping.</p>
          </div>
        </div>
      ) : null}

      <div className="shopping-toolbar">
        <div className="shopping-progress">
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${total ? (checked / total) * 100 : 0}%` }}
            />
          </div>
          <span>
            {checked} of {total} checked
          </span>
        </div>
        <button
          className="secondary-button"
          onClick={() => setGenerateOpen(true)}
        >
          <RotateCcw size={15} /> Refresh
        </button>
        <button
          className="primary-button"
          disabled={!checked}
          onClick={() => setCompleteOpen(true)}
        >
          Finish
        </button>
      </div>

      <div className="manual-add-row">
        <input
          value={manualName}
          onChange={(event) => setManualName(event.target.value)}
          placeholder="Add anything else"
          onKeyDown={(event) => {
            if (event.key === "Enter" && manualName.trim()) {
              addShoppingItem(manualName.trim());
              setManualName("");
            }
          }}
        />
        <button
          className="secondary-button"
          onClick={() => {
            if (!manualName.trim()) return;
            addShoppingItem(manualName.trim());
            setManualName("");
          }}
        >
          <Plus size={16} /> Add
        </button>
      </div>

      <div className="list-stack">
        {shoppingItems.map((item) => (
          <article
            className={`shopping-row ${item.checked ? "checked" : ""}`}
            key={item.id}
          >
            <button
              className="shopping-check"
              type="button"
              onClick={() => toggleShoppingItem(item.id)}
              aria-label={`${item.checked ? "Uncheck" : "Check"} ${item.name}`}
            >
              {item.checked ? <Check size={16} /> : null}
            </button>
            <button
              className="row-main row-main-button"
              type="button"
              onClick={() => toggleShoppingItem(item.id)}
            >
              <strong>{item.name}</strong>
              <span>
                {item.quantity === null
                  ? item.qualitative ?? "as needed"
                  : formatIngredientAmount(item)}
                {item.manual ? " · added manually" : ""}
              </span>
            </button>
            <button
              className="mini-button"
              type="button"
              aria-label={`Remove ${item.name}`}
              onClick={() => {
                removeShoppingItem(item.id);
                notify(`${item.name} removed from the shopping list.`);
              }}
            >
              <Trash2 size={14} />
            </button>
          </article>
        ))}
      </div>

      <div className="offline-note">
        <WifiOff size={17} />
        Check-offs and manual additions are stored on this phone and sync when
        connection returns.
      </div>
      <CompleteShoppingModal
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        notify={notify}
      />
      <GenerateShoppingListModal
        open={generateOpen}
        weekRange={selectedWeekRange}
        regenerating
        onClose={() => setGenerateOpen(false)}
        onConfirm={() => {
          generateList();
          notify(`Shopping list regenerated for ${selectedWeekRange}.`);
          setGenerateOpen(false);
        }}
      />
    </>
  );
}

function GenerateShoppingListModal({
  open,
  weekRange,
  regenerating,
  onClose,
  onConfirm
}: {
  open: boolean;
  weekRange: string;
  regenerating: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      title={regenerating ? "Regenerate grocery list?" : "Generate grocery list?"}
      eyebrow="Confirm week"
      onClose={onClose}
    >
      <p className="modal-lede">
        {regenerating
          ? "This will refresh the grocery list for"
          : "This will create a grocery list for"}{" "}
        <strong>{weekRange}</strong>. Matching checked items and manual
        additions are preserved when possible.
      </p>
      <div className="form-actions">
        <button className="secondary-button" onClick={onClose}>
          Cancel
        </button>
        <button className="primary-button" onClick={onConfirm}>
          <ShoppingBasket size={16} />
          {regenerating ? "Regenerate list" : "Generate list"}
        </button>
      </div>
    </Modal>
  );
}

function CompleteShoppingModal({
  open,
  onClose,
  notify
}: {
  open: boolean;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const { state, completeShopping } = useAppStore();
  const checked = useMemo(
    () =>
      state.shoppingList?.items.filter((item) => item.checked) ?? [],
    [state.shoppingList]
  );
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (open) setSelected(checked.map((item) => item.id));
  }, [open, checked]);

  return (
    <Modal
      open={open}
      title="Put purchases away"
      eyebrow="Finish shopping"
      onClose={onClose}
    >
      <p className="modal-lede">
        Confirm what should be remembered in the pantry. Uncheck anything that
        was consumed immediately or should not be tracked.
      </p>
      <div className="list-stack">
        {checked.map((item) => (
          <button
            className={`shopping-row ${selected.includes(item.id) ? "checked" : ""}`}
            key={item.id}
            onClick={() =>
              setSelected((current) =>
                current.includes(item.id)
                  ? current.filter((id) => id !== item.id)
                  : [...current, item.id]
              )
            }
          >
            <span className="shopping-check">
              {selected.includes(item.id) ? <Check size={16} /> : null}
            </span>
            <span className="row-main">
              <strong>{item.name}</strong>
              <span>
                {formatIngredientAmount(item)}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="form-actions">
        <button className="secondary-button" onClick={onClose}>
          Keep shopping
        </button>
        <button
          className="primary-button"
          onClick={() => {
            completeShopping(selected);
            notify(`${selected.length} purchase(s) added to pantry.`);
            onClose();
          }}
        >
          Finish and restock
        </button>
      </div>
    </Modal>
  );
}

function CookingReviewModal({
  mealId,
  onClose,
  onChangeNextTime,
  notify
}: {
  mealId: string | null;
  onClose: () => void;
  onChangeNextTime: (recipeId: string) => void;
  notify: (message: string) => void;
}) {
  const { state, cookMeal } = useAppStore();
  const meal = state.weeklyPlan.meals.find(
    (candidate) => candidate.id === mealId
  );
  const recipe = state.recipes.find(
    (candidate) => candidate.id === meal?.recipeId
  );
  const [savingAction, setSavingAction] = useState<
    "complete" | "change-next-time" | null
  >(null);

  useEffect(() => {
    if (!mealId) setSavingAction(null);
  }, [mealId]);

  async function markCooked(action: "complete" | "change-next-time") {
    if (!meal || !recipe) return;
    setSavingAction(action);
    try {
      await cookMeal(meal.id, "", []);
      notify(
        action === "change-next-time"
          ? `${recipe.title} marked cooked. Make any recipe changes for next time.`
          : `${recipe.title} marked cooked and pantry usage recorded.`
      );
      onClose();
      if (action === "change-next-time") onChangeNextTime(recipe.id);
    } finally {
      setSavingAction(null);
    }
  }

  return (
    <Modal
      open={Boolean(mealId && recipe)}
      title={recipe ? `How did ${recipe.title} go?` : "Cooking review"}
      eyebrow="Mark cooked"
      onClose={onClose}
    >
      <div className="cooking-intro">
        <ChefHat size={25} />
        <div>
          <strong>Mark this dinner cooked</strong>
          <p>
            We will assume you used the recipe amounts as saved. If the recipe
            should change for next time, you can edit it right after marking it
            cooked.
          </p>
        </div>
      </div>

      <div className="form-actions">
        <button className="secondary-button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="secondary-button"
          disabled={Boolean(savingAction)}
          onClick={() => void markCooked("change-next-time")}
        >
          {savingAction === "change-next-time" ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Pencil size={16} />
          )}
          Change next time
        </button>
        <button
          className="primary-button"
          disabled={Boolean(savingAction)}
          onClick={() => void markCooked("complete")}
        >
          {savingAction === "complete" ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Check size={16} />
          )}
          Complete
        </button>
      </div>
    </Modal>
  );
}

function ProposalReviewModal({
  proposalId,
  onClose,
  notify
}: {
  proposalId: string | null;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const { state, reviewProposal } = useAppStore();
  const proposal = state.proposals.find(
    (candidate) => candidate.id === proposalId
  );
  const recipe = state.recipes.find(
    (candidate) => candidate.id === proposal?.recipeId
  );
  const [ingredients, setIngredients] = useState<IngredientAmount[]>([]);

  useEffect(() => {
    setIngredients(
      proposal?.proposedIngredients.map((ingredient) => ({
        ...ingredient
      })) ?? []
    );
  }, [proposalId, proposal]);

  if (!proposal || !recipe) {
    return (
      <Modal open={false} title="Recipe feedback" onClose={onClose}>
        {null}
      </Modal>
    );
  }
  const activeProposal = proposal;
  const activeRecipe = recipe;

  async function review(status: "approved" | "ignored") {
    const result = await reviewProposal(
      activeProposal.id,
      status,
      ingredients
    );
    if (!result.ok) {
      notify(result.message ?? "Could not review this change.");
      return;
    }
    notify(
      status === "approved"
        ? `${activeRecipe.title} updated to version ${
            activeRecipe.currentVersion + 1
          }.`
        : "Feedback kept in cooking history without changing the recipe."
    );
    onClose();
  }

  return (
    <Modal
      open
      title={`Improve ${activeRecipe.title}`}
      eyebrow="Review cooking feedback"
      onClose={onClose}
      wide
    >
      <div className="proposal-callout">
        <Sparkles size={22} />
        <div>
          <strong>Nothing changes until you approve it</strong>
          <p>
            This proposal is based on recipe version{" "}
            {activeProposal.basedOnVersion}.
            Edit quantities now or keep the feedback only in cooking history.
          </p>
        </div>
      </div>
      {activeProposal.note ? (
        <blockquote className="cook-note">
          “{activeProposal.note}”
        </blockquote>
      ) : null}
      <div className="subsection-header">
        <h3>Proposed ingredients</h3>
      </div>
      <div className="form-grid compact-grid">
        {ingredients.map((ingredient) => (
          <div className="ingredient-editor-row" key={ingredient.id}>
            <input
              value={ingredient.name}
              onChange={(event) =>
                setIngredients((current) =>
                  current.map((candidate) =>
                    candidate.id === ingredient.id
                      ? { ...candidate, name: event.target.value }
                      : candidate
                  )
                )
              }
            />
            <input
              value={
                ingredient.quantity === null ? "" : String(ingredient.quantity)
              }
              placeholder={ingredient.qualitative ?? "Qty"}
              onChange={(event) =>
                setIngredients((current) =>
                  current.map((candidate) =>
                    candidate.id === ingredient.id
                      ? {
                          ...candidate,
                          quantity: parseQuantity(event.target.value),
                          qualitative: event.target.value
                            ? undefined
                            : candidate.qualitative
                        }
                      : candidate
                  )
                )
              }
            />
            <UnitInput
              listId={`proposal-unit-options-${ingredient.id}`}
              value={ingredient.unit}
              onChange={(unit, dimension) =>
                setIngredients((current) =>
                  current.map((candidate) =>
                    candidate.id === ingredient.id
                      ? { ...candidate, unit, dimension }
                      : candidate
                  )
                )
              }
            />
            <button
              className="mini-button"
              onClick={() =>
                setIngredients((current) =>
                  current.filter(
                    (candidate) => candidate.id !== ingredient.id
                  )
                )
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="form-actions">
        <button className="secondary-button" onClick={() => review("ignored")}>
          Keep as history only
        </button>
        <button className="primary-button" onClick={() => review("approved")}>
          Approve new recipe version
        </button>
      </div>
    </Modal>
  );
}

function HouseholdScreen({ notify }: { notify: (message: string) => void }) {
  const { state, setAiModel, updateMemberProfile } = useAppStore();
  const currentMember =
    state.members.find((member) => member.id === state.currentMemberId) ??
    state.members[0];
  const [householdOpen, setHouseholdOpen] = useState(false);
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [modelId, setModelId] = useState(state.household.aiModelId ?? "");
  const [displayName, setDisplayName] = useState(
    currentMember?.displayName ?? ""
  );
  const [avatarUrl, setAvatarUrl] = useState(currentMember?.avatarUrl ?? "");
  const [avatarColor, setAvatarColor] = useState(
    currentMember?.avatarColor ?? "#315c4a"
  );

  useEffect(() => {
    void fetch("/api/ai/models")
      .then(async (response) => {
        if (!response.ok) return;
        const result = (await response.json()) as {
          models?: AiModelOption[];
        };
        setModels(result.models ?? []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setModelId(state.household.aiModelId ?? "");
  }, [state.household.aiModelId]);

  useEffect(() => {
    setDisplayName(currentMember?.displayName ?? "");
    setAvatarUrl(currentMember?.avatarUrl ?? "");
    setAvatarColor(currentMember?.avatarColor ?? "#315c4a");
  }, [currentMember]);

  return (
    <>
      <div className="screen-header">
        <div>
          <p className="eyebrow">Account and household</p>
          <h1>Settings</h1>
        </div>
      </div>

      <div className="settings-grid">
        <section className="settings-card card">
          <div className="settings-card-header">
            <Avatar
              name={displayName || "You"}
              color={avatarColor}
              imageUrl={avatarUrl}
            />
            <div>
              <h3>Your account</h3>
              <p>Set the name and picture shown around the app.</p>
            </div>
          </div>
          <div className="form-grid compact-grid">
            <label>
              Display name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Your name"
              />
            </label>
            <label>
              Display picture URL
              <input
                type="url"
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://..."
              />
            </label>
            <label>
              Initials color
              <input
                type="color"
                value={avatarColor}
                onChange={(event) => setAvatarColor(event.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={async () => {
                const saved = await updateMemberProfile({
                  displayName,
                  avatarColor,
                  avatarUrl
                });
                if (saved) notify("Account settings saved.");
              }}
            >
              Save account
            </button>
            <button
              className="danger-button"
              onClick={async () => {
                const supabase = createClient();
                await supabase?.auth.signOut();
                await clearOfflineShoppingData();
                window.location.href = "/auth";
              }}
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </section>

        <section className="settings-card card">
          <Home size={23} color="#315c4a" />
          <h3>Household settings</h3>
          <p>
            {state.household.name} is used as the creator name when your
            household publishes recipes.
          </p>
          <button
            className="primary-button"
            type="button"
            onClick={() => setHouseholdOpen(true)}
          >
            <Users size={16} /> Review household
          </button>
        </section>

        <section className="settings-card card">
          <Settings size={23} color="#315c4a" />
          <h3>Recipe import model</h3>
          <p>
            Leave this blank to use the app default. You can still temporarily
            override the model when importing an individual recipe.
          </p>
          <label>
            OpenRouter model
            <input
              list="household-openrouter-models"
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
              placeholder="Use app default"
            />
            <datalist id="household-openrouter-models">
              {models.map((model) => (
                <option value={model.id} key={model.id}>
                  {model.name}
                </option>
              ))}
            </datalist>
          </label>
          <button
            className="secondary-button"
            onClick={async () => {
              const saved = await setAiModel(modelId);
              if (saved) {
                notify(
                  modelId.trim()
                    ? "Household OpenRouter model updated."
                    : "Household is using the app default model."
                );
              }
            }}
          >
            Save model
          </button>
          {modelId ? (
            <button
              className="ghost-button"
              type="button"
              onClick={() => setModelId("")}
            >
              Use app default
            </button>
          ) : null}
        </section>
        <section className="settings-card card">
          <Apple size={23} color="#315c4a" />
          <h3>Install on iPhone</h3>
          <p>
            In Safari, tap Share, then “Add to Home Screen.” The active
            shopping list remains available when store reception is poor.
          </p>
          <div className="install-steps">
            <span>1. Open in Safari</span>
            <span>2. Tap Share</span>
            <span>3. Add to Home Screen</span>
          </div>
        </section>
      </div>
      <HouseholdSettingsModal
        open={householdOpen}
        onClose={() => setHouseholdOpen(false)}
        notify={notify}
      />
    </>
  );
}

function HouseholdSettingsModal({
  open,
  onClose,
  notify
}: {
  open: boolean;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const { state, updateHousehold } = useAppStore();
  const [householdName, setHouseholdName] = useState(state.household.name);
  const [inviteEmail, setInviteEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    setHouseholdName(state.household.name);
  }, [open, state.household.name]);

  async function invite() {
    if (!inviteEmail.includes("@")) {
      notify("Enter the email address for the person you want to invite.");
      return;
    }
    setSending(true);
    try {
      const response = await fetch("/api/household-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail })
      });
      const result = (await response.json()) as {
        inviteUrl?: string;
        emailSent?: boolean;
        emailError?: string;
        error?: string;
      };
      if (!response.ok || !result.inviteUrl) {
        throw new Error(result.error ?? "Invitation failed.");
      }
      setInviteUrl(result.inviteUrl);
      notify(
        result.emailSent
          ? `Invitation emailed to ${inviteEmail}.`
          : result.emailError
            ? "Invitation link prepared. Email could not be sent automatically."
            : `Invitation link prepared for ${inviteEmail}.`
      );
      setInviteEmail("");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not create the invitation."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Household settings"
      eyebrow={state.household.name}
      onClose={onClose}
      wide
    >
      <div className="form-grid">
        <section className="settings-card card">
          <Home size={23} color="#315c4a" />
          <h3>Household name</h3>
          <p>
            This is the creator name used when your household publishes a
            recipe.
          </p>
          <div className="invite-row">
            <input
              value={householdName}
              onChange={(event) => setHouseholdName(event.target.value)}
              placeholder="Household name"
            />
            <button
              className="primary-button"
              type="button"
              onClick={async () => {
                const saved = await updateHousehold(householdName);
                if (saved) notify("Household name updated.");
              }}
            >
              Save
            </button>
          </div>
        </section>

        <section className="settings-card card">
          <Users size={23} color="#315c4a" />
          <h3>Members</h3>
          <p>Everyone in the household can edit recipes, plans, pantry, and lists.</p>
          {state.members.map((member) => (
            <div className="member-row" key={member.id}>
              <Avatar
                name={member.displayName}
                color={member.avatarColor}
                imageUrl={member.avatarUrl}
              />
              <div className="row-main">
                <strong>{member.displayName}</strong>
                <span>{member.email} · Equal editor</span>
              </div>
              {member.id === state.currentMemberId ? (
                <span className="cooked-badge">You are here</span>
              ) : null}
            </div>
          ))}
        </section>

        <section className="settings-card card">
          <Users size={23} color="#315c4a" />
          <h3>Invite someone</h3>
          <p>
            Invitations are single-use, expire after seven days, and are tied to
            this household.
          </p>
          <div className="invite-row">
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="partner@example.com"
            />
            <button
              className="primary-button"
              onClick={invite}
              disabled={sending}
            >
              {sending ? <LoaderCircle className="spin" size={16} /> : "Invite"}
            </button>
          </div>
          {inviteUrl ? (
            <div className="form-grid">
              <label>
                Copyable invitation link
                <input value={inviteUrl} readOnly />
              </label>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(inviteUrl);
                  notify("Invitation link copied.");
                }}
              >
                Copy invitation link
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </Modal>
  );
}
