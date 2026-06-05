"use client";

import {
  Apple,
  BookOpen,
  CalendarDays,
  Check,
  ChefHat,
  ChevronRight,
  CircleAlert,
  Clock3,
  Heart,
  Home,
  LoaderCircle,
  PackageCheck,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
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
  startOfDay
} from "date-fns";
import { useEffect, useMemo, useState } from "react";
import type {
  CookingAdjustment,
  GroceryAisle,
  IngredientAmount,
  PlannedMeal,
  Recipe,
  ShoppingListItem
} from "@/lib/domain/types";
import {
  createIngredient,
  formatQuantity,
  inferAisle,
  parseQuantity
} from "@/lib/domain/quantities";
import { createAdjustment } from "@/lib/domain/cooking";
import {
  buildPantryReview,
  currentRecipeVersion
} from "@/lib/domain/shopping";
import { rankRecipeSuggestions } from "@/lib/domain/suggestions";
import { useDemoStore } from "@/lib/demo/store";
import {
  Avatar,
  EmptyState,
  Modal,
  SegmentedControl
} from "@/components/ui";

type Tab = "week" | "recipes" | "pantry" | "shopping" | "settings";

const TAB_ITEMS: Array<{
  value: Tab;
  label: string;
  icon: typeof CalendarDays;
}> = [
  { value: "week", label: "Week", icon: CalendarDays },
  { value: "recipes", label: "Recipes", icon: BookOpen },
  { value: "pantry", label: "Pantry", icon: PackageCheck },
  { value: "shopping", label: "Shop", icon: ShoppingBasket },
  { value: "settings", label: "Household", icon: Users }
];

function mealRecipe(meal: PlannedMeal | undefined, recipes: Recipe[]) {
  if (!meal?.recipeId) return undefined;
  return recipes.find((recipe) => recipe.id === meal.recipeId);
}

function quantityLabel(quantity: number | null, unit: string) {
  if (quantity === null) return `In stock · amount unknown`;
  return `${formatQuantity(quantity)}${unit && unit !== "count" ? ` ${unit}` : ""}`;
}

export function DinnerPlannerApp() {
  const { state, loaded } = useDemoStore();
  const [tab, setTab] = useState<Tab>("week");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
        <div className="header-actions">
          <span className="demo-pill">Local demo</span>
          <Avatar
            name={currentMember.displayName}
            color={currentMember.avatarColor}
            small
          />
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
              onClick={() => setTab(item.value)}
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
    </div>
  );
}

function WeekScreen({ notify }: { notify: (message: string) => void }) {
  const { state, removeMeal } = useDemoStore();
  const [pickerDate, setPickerDate] = useState<string | null>(null);
  const [cookMealId, setCookMealId] = useState<string | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const days = Array.from({ length: 7 }, (_, index) =>
    addDays(parseISO(state.weeklyPlan.weekStart), index)
  );
  const suggestions = rankRecipeSuggestions({
    recipes: state.recipes,
    sessions: state.cookingSessions,
    plannedMeals: state.weeklyPlan.meals
  }).slice(0, 3);
  const pending = state.proposals.filter(
    (proposal) => proposal.status === "pending"
  );

  return (
    <>
      <div className="screen-header">
        <div>
          <p className="eyebrow">{format(days[0], "MMMM yyyy")}</p>
          <h1>This week</h1>
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
                      <span>
                        <Clock3 size={12} />{" "}
                        {recipe.prepMinutes + recipe.cookMinutes} min
                      </span>
                      <span>{meal?.servings} servings</span>
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
              {suggestion.recipe.prepMinutes + suggestion.recipe.cookMinutes}{" "}
              minutes · {suggestion.recipe.tags[0]}
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
        onProposal={(id) => setProposalId(id)}
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
  const { state, scheduleRecipe, scheduleSpecial } = useDemoStore();
  const [servings, setServings] = useState(state.household.defaultServings);
  const [query, setQuery] = useState("");
  const recipes = state.recipes.filter((recipe) =>
    `${recipe.title} ${recipe.tags.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  return (
    <Modal
      open={Boolean(date)}
      title={date ? format(parseISO(date), "EEEE, MMMM d") : "Choose dinner"}
      eyebrow="Plan dinner"
      onClose={onClose}
    >
      <div className="form-two">
        <label>
          Servings
          <input
            type="number"
            min={1}
            value={servings}
            onChange={(event) => setServings(Number(event.target.value))}
          />
        </label>
        <label>
          Find a recipe
          <input
            value={query}
            placeholder="Search recipes"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="meal-picker-list">
        {recipes.map((recipe) => (
          <button
            className="meal-picker-item"
            type="button"
            key={recipe.id}
            onClick={() => {
              scheduleRecipe(date!, recipe.id, servings);
              notify(`${recipe.title} added to the week.`);
              onClose();
            }}
          >
            <span
              className="meal-picker-thumb"
              style={{ backgroundImage: `url("${recipe.imageUrl ?? ""}")` }}
            />
            <span className="row-main">
              <strong>{recipe.title}</strong>
              <span>
                {recipe.prepMinutes + recipe.cookMinutes} minutes ·{" "}
                {recipe.tags.slice(0, 2).join(" · ")}
              </span>
            </span>
            <ChevronRight size={17} />
          </button>
        ))}
        <div className="form-two">
          <button
            className="secondary-button"
            onClick={() => {
              scheduleSpecial(date!, "leftovers", servings);
              notify("Leftovers night added.");
              onClose();
            }}
          >
            Leftovers
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              scheduleSpecial(date!, "dining-out", servings);
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
  const { state, toggleFavorite } = useDemoStore();
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const pending = state.proposals.filter(
    (proposal) => proposal.status === "pending"
  );
  const recipes = state.recipes.filter((recipe) =>
    `${recipe.title} ${recipe.description} ${recipe.tags.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  return (
    <>
      <div className="screen-header">
        <div>
          <p className="eyebrow">{state.recipes.length} household recipes</p>
          <h1>Recipe box</h1>
          <p>Every keeper, plus the little changes that made it yours.</p>
        </div>
        <button className="primary-button" onClick={() => setEditorOpen(true)}>
          <Plus size={17} />
          <span className="header-cta-label">Add recipe</span>
        </button>
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

      <div className="search-row">
        <div className="search-input-wrap">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by recipe, ingredient, or tag"
          />
        </div>
      </div>

      <div className="recipe-grid">
        {recipes.map((recipe) => (
          <article className="recipe-card card" key={recipe.id}>
            <div
              className="recipe-image"
              style={{ backgroundImage: `url("${recipe.imageUrl ?? ""}")` }}
              onClick={() => setDetailId(recipe.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  setDetailId(recipe.id);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Open ${recipe.title}`}
            >
              <button
                className="favorite-button"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleFavorite(recipe.id);
                }}
                aria-label={
                  recipe.favorite ? "Remove from favorites" : "Add to favorites"
                }
              >
                <Heart
                  size={18}
                  fill={recipe.favorite ? "currentColor" : "none"}
                />
              </button>
            </div>
            <button
              type="button"
              className="recipe-card-body"
              onClick={() => setDetailId(recipe.id)}
            >
              <h3>{recipe.title}</h3>
              <p>{recipe.description}</p>
              <div className="tag-row">
                {recipe.tags.slice(0, 3).map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
              <div className="recipe-footer">
                <span>
                  <Clock3 size={12} />{" "}
                  {recipe.prepMinutes + recipe.cookMinutes} min
                </span>
                <span>v{recipe.currentVersion}</span>
              </div>
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
      />
      <ProposalReviewModal
        proposalId={proposalId}
        onClose={() => setProposalId(null)}
        notify={notify}
      />
    </>
  );
}

interface IngredientEditorValue {
  id: string;
  name: string;
  quantity: string;
  unit: string;
}

function emptyIngredient(): IngredientEditorValue {
  return {
    id: crypto.randomUUID(),
    name: "",
    quantity: "",
    unit: "count"
  };
}

function RecipeEditorModal({
  open,
  onClose,
  notify
}: {
  open: boolean;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const { addRecipe } = useDemoStore();
  const [mode, setMode] = useState<"manual" | "import">("manual");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [creator, setCreator] = useState("");
  const [yieldCount, setYieldCount] = useState("4");
  const [prepMinutes, setPrepMinutes] = useState("15");
  const [cookMinutes, setCookMinutes] = useState("30");
  const [tags, setTags] = useState("");
  const [ingredients, setIngredients] = useState<IngredientEditorValue[]>([
    emptyIngredient(),
    emptyIngredient()
  ]);
  const [instructions, setInstructions] = useState([""]);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  function reset() {
    setMode("manual");
    setTitle("");
    setDescription("");
    setSourceUrl("");
    setCreator("");
    setYieldCount("4");
    setPrepMinutes("15");
    setCookMinutes("30");
    setTags("");
    setIngredients([emptyIngredient(), emptyIngredient()]);
    setInstructions([""]);
    setImportText("");
    setWarnings([]);
  }

  async function analyzeImport() {
    if (!sourceUrl && !importText) {
      notify("Paste a recipe link or some recipe text first.");
      return;
    }
    setImporting(true);
    try {
      const response = await fetch("/api/recipe-imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl || undefined, text: importText })
      });
      if (!response.ok) throw new Error("Import failed");
      const draft = (await response.json()) as {
        title: string;
        description: string;
        sourceUrl?: string;
        sourceCreator?: string;
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
      setCreator(draft.sourceCreator ?? "");
      setYieldCount(String(draft.yield || 4));
      setPrepMinutes(String(draft.prepMinutes || 0));
      setCookMinutes(String(draft.cookMinutes || 0));
      setTags(draft.tags.join(", "));
      setIngredients(
        draft.ingredients.map((ingredient) => ({
          id: ingredient.id || crypto.randomUUID(),
          name: ingredient.name,
          quantity:
            ingredient.quantity === null ? "" : String(ingredient.quantity),
          unit: ingredient.unit
        }))
      );
      setInstructions(draft.instructions.length ? draft.instructions : [""]);
      setWarnings(draft.warnings);
      setMode("manual");
      notify("Draft extracted. Review every field before saving.");
    } catch {
      notify("I could not read that recipe. Try pasting the caption or text.");
    } finally {
      setImporting(false);
    }
  }

  function saveRecipe() {
    const parsedIngredients = ingredients
      .filter((ingredient) => ingredient.name.trim())
      .map((ingredient) =>
        createIngredient(
          ingredient.id,
          ingredient.name.trim(),
          parseQuantity(ingredient.quantity),
          ingredient.unit
        )
      );
    if (!title.trim() || parsedIngredients.length === 0) {
      notify("Add a title and at least one ingredient.");
      return;
    }
    addRecipe({
      title: title.trim(),
      description: description.trim(),
      sourceUrl: sourceUrl.trim() || undefined,
      sourceCreator: creator.trim() || undefined,
      imageUrl:
        "https://images.unsplash.com/photo-1543353071-873f17a7a088?auto=format&fit=crop&w=900&q=80",
      prepMinutes: Number(prepMinutes) || 0,
      cookMinutes: Number(cookMinutes) || 0,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      favorite: false,
      yield: Number(yieldCount) || 4,
      ingredients: parsedIngredients,
      instructions: instructions.map((step) => step.trim()).filter(Boolean)
    });
    notify(`${title.trim()} added to the household recipe box.`);
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      title="Add a recipe"
      eyebrow="Recipe box"
      onClose={() => {
        reset();
        onClose();
      }}
      wide
    >
      <SegmentedControl
        value={mode}
        options={[
          { value: "manual", label: "Enter manually" },
          { value: "import", label: "Import with AI" }
        ]}
        onChange={setMode}
      />

      {mode === "import" ? (
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
          <label className="upload-placeholder">
            Screenshots
            <span>
              Screenshot upload is enabled when Supabase Storage and OpenAI are
              configured.
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
          <div className="form-three">
            <label>
              Makes
              <input
                type="number"
                min={1}
                value={yieldCount}
                onChange={(event) => setYieldCount(event.target.value)}
              />
            </label>
            <label>
              Prep min
              <input
                type="number"
                min={0}
                value={prepMinutes}
                onChange={(event) => setPrepMinutes(event.target.value)}
              />
            </label>
            <label>
              Cook min
              <input
                type="number"
                min={0}
                value={cookMinutes}
                onChange={(event) => setCookMinutes(event.target.value)}
              />
            </label>
          </div>
          <div className="form-two">
            <label>
              Source link
              <input
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="Optional"
              />
            </label>
            <label>
              Creator
              <input
                value={creator}
                onChange={(event) => setCreator(event.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>
          <label>
            Tags
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="quick, vegetarian, family favorite"
            />
          </label>

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
              {ingredients.map((ingredient) => (
                <div className="ingredient-editor-row" key={ingredient.id}>
                  <input
                    value={ingredient.name}
                    placeholder="Ingredient"
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
                    value={ingredient.quantity}
                    placeholder="Qty"
                    onChange={(event) =>
                      setIngredients((current) =>
                        current.map((candidate) =>
                          candidate.id === ingredient.id
                            ? { ...candidate, quantity: event.target.value }
                            : candidate
                        )
                      )
                    }
                  />
                  <input
                    value={ingredient.unit}
                    placeholder="Unit"
                    onChange={(event) =>
                      setIngredients((current) =>
                        current.map((candidate) =>
                          candidate.id === ingredient.id
                            ? { ...candidate, unit: event.target.value }
                            : candidate
                        )
                      )
                    }
                  />
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
              ))}
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
              Save recipe
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function RecipeDetailModal({
  recipeId,
  onClose
}: {
  recipeId: string | null;
  onClose: () => void;
}) {
  const { state } = useDemoStore();
  const recipe = state.recipes.find((candidate) => candidate.id === recipeId);
  if (!recipe) {
    return (
      <Modal open={false} title="Recipe" onClose={onClose}>
        {null}
      </Modal>
    );
  }
  const version = currentRecipeVersion(recipe);
  return (
    <Modal open title={recipe.title} eyebrow="Household recipe" onClose={onClose}>
      <div
        className="recipe-hero"
        style={{ backgroundImage: `url("${recipe.imageUrl ?? ""}")` }}
      />
      <p>{recipe.description}</p>
      <div className="tag-row">
        {recipe.tags.map((tag) => (
          <span className="tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <div className="recipe-detail-meta">
        <div>
          <strong>{version.yield}</strong>
          <span>Servings</span>
        </div>
        <div>
          <strong>{recipe.prepMinutes}</strong>
          <span>Prep min</span>
        </div>
        <div>
          <strong>{recipe.cookMinutes}</strong>
          <span>Cook min</span>
        </div>
        <div>
          <strong>v{recipe.currentVersion}</strong>
          <span>Version</span>
        </div>
      </div>
      <div className="subsection-header">
        <h3>Ingredients</h3>
      </div>
      <ul className="ingredient-list">
        {version.ingredients.map((ingredient) => (
          <li key={ingredient.id}>
            <span>{ingredient.name}</span>
            <strong>
              {ingredient.quantity === null
                ? ingredient.qualitative ?? "as needed"
                : `${formatQuantity(ingredient.quantity)} ${
                    ingredient.unit === "count" ? "" : ingredient.unit
                  }`}
            </strong>
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
          This recipe has {recipe.versions.length} saved versions. The current
          version includes approved cooking feedback.
        </div>
      ) : null}
    </Modal>
  );
}

function PantryScreen({ notify }: { notify: (message: string) => void }) {
  const { state, removePantryItem } = useDemoStore();
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
            <span className="aisle-dot" />
            <button
              className="row-main"
              type="button"
              onClick={() => setEditId(item.id)}
            >
              <strong>{item.name}</strong>
              <span>
                {quantityLabel(item.quantity, item.unit)} · {item.aisle}
              </span>
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
  const { state, upsertPantryItem } = useDemoStore();
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
              <input
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                placeholder="count, cups, oz"
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
    upsertPantryItem
  } = useDemoStore();
  const [manualName, setManualName] = useState("");
  const [completeOpen, setCompleteOpen] = useState(false);
  const review = useMemo(
    () =>
      buildPantryReview(state.weeklyPlan, state.recipes, state.pantry),
    [state.weeklyPlan, state.recipes, state.pantry]
  );
  const unresolved = review.filter((line) => line.unresolved);
  const list = state.shoppingList;
  const checked = list?.items.filter((item) => item.checked).length ?? 0;
  const total = list?.items.length ?? 0;
  const grouped = useMemo(() => {
    const map = new Map<GroceryAisle, ShoppingListItem[]>();
    if (!list) return map;
    for (const item of list.items) {
      map.set(item.aisle, [...(map.get(item.aisle) ?? []), item]);
    }
    return map;
  }, [list]);

  if (!list || list.stale) {
    return (
      <>
        <div className="screen-header">
          <div>
            <p className="eyebrow">Before the store</p>
            <h1>Pantry check</h1>
            <p>
              We combined the week’s recipes. Confirm what is already home,
              then generate only what you need.
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
              <span className="aisle-dot" />
              <div className="row-main">
                <strong>{line.name}</strong>
                <div className="review-amounts">
                  <span>
                    Need{" "}
                    <strong>
                      {formatQuantity(line.requiredQuantity)} {line.unit}
                    </strong>
                  </span>
                  <span>
                    Have{" "}
                    <strong>
                      {line.availableQuantity === null
                        ? "unknown"
                        : `${formatQuantity(line.availableQuantity)} ${line.unit}`}
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
                  {formatQuantity(line.allocatedQuantity)}
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
                generateList();
                notify("Shopping list generated from this week and pantry.");
              }}
            >
              <ShoppingBasket size={17} />
              {list ? "Regenerate list" : "Generate list"}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="screen-header">
        <div>
          <p className="eyebrow">Shared and pantry-aware</p>
          <h1>Shopping list</h1>
          <p>Check it on either phone. The active list works offline too.</p>
        </div>
      </div>

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
        <button className="secondary-button" onClick={generateList}>
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

      {[...grouped.entries()].map(([aisle, items]) => (
        <section className="shopping-section" key={aisle}>
          <h3>
            <span className="aisle-dot" /> {aisle}
          </h3>
          <div>
            {items.map((item) => (
              <button
                className={`shopping-row ${item.checked ? "checked" : ""}`}
                type="button"
                key={item.id}
                onClick={() => toggleShoppingItem(item.id)}
              >
                <span className="shopping-check">
                  {item.checked ? <Check size={16} /> : null}
                </span>
                <span className="row-main">
                  <strong>{item.name}</strong>
                  <span>
                    {item.quantity === null
                      ? item.qualitative ?? "as needed"
                      : `${formatQuantity(item.quantity)} ${
                          item.unit === "count" ? "" : item.unit
                        }`}
                    {item.manual ? " · added manually" : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

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
    </>
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
  const { state, completeShopping } = useDemoStore();
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
                {formatQuantity(item.quantity)}{" "}
                {item.unit === "count" ? "" : item.unit}
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
  onProposal,
  notify
}: {
  mealId: string | null;
  onClose: () => void;
  onProposal: (proposalId: string) => void;
  notify: (message: string) => void;
}) {
  const { state, cookMeal } = useDemoStore();
  const meal = state.weeklyPlan.meals.find(
    (candidate) => candidate.id === mealId
  );
  const recipe = state.recipes.find(
    (candidate) => candidate.id === meal?.recipeId
  );
  const version = recipe ? currentRecipeVersion(recipe) : null;
  const [notes, setNotes] = useState("");
  const [adjustments, setAdjustments] = useState<CookingAdjustment[]>([]);
  const [ingredientId, setIngredientId] = useState("");
  const [newName, setNewName] = useState("");
  const [intent, setIntent] =
    useState<CookingAdjustment["intent"]>("actual");
  const [kind, setKind] = useState<CookingAdjustment["kind"]>("more");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("count");
  const [qualitative, setQualitative] =
    useState<NonNullable<CookingAdjustment["qualitative"]>>("some");

  useEffect(() => {
    if (!mealId) return;
    setNotes("");
    setAdjustments([]);
    setIngredientId(version?.ingredients[0]?.id ?? "new");
    setNewName("");
    setIntent("actual");
    setKind("more");
    setQuantity("");
    setUnit(version?.ingredients[0]?.unit ?? "count");
  }, [mealId, version]);

  const selectedIngredient = version?.ingredients.find(
    (ingredient) => ingredient.id === ingredientId
  );

  function addAdjustment() {
    const name =
      ingredientId === "new" ? newName.trim() : selectedIngredient?.name;
    if (!name) {
      notify("Choose or name an ingredient.");
      return;
    }
    const parsed = kind === "skipped" ? 0 : parseQuantity(quantity);
    setAdjustments((current) => [
      ...current,
      createAdjustment({
        ingredientId:
          ingredientId === "new" ? undefined : selectedIngredient?.id,
        name,
        intent,
        kind: ingredientId === "new" ? "new" : kind,
        quantity: kind === "skipped" ? 0 : parsed,
        unit:
          ingredientId === "new" ? unit : selectedIngredient?.unit ?? unit,
        qualitative: parsed === null ? qualitative : undefined,
        aisle:
          ingredientId === "new"
            ? inferAisle(name)
            : selectedIngredient?.aisle
      })
    ]);
    setQuantity("");
    setNewName("");
  }

  function submit() {
    if (!meal || !recipe) return;
    const proposal = cookMeal(meal.id, notes, adjustments);
    notify(
      proposal
        ? `${recipe.title} marked cooked. Recipe improvements are ready to review.`
        : `${recipe.title} marked cooked and pantry usage recorded.`
    );
    onClose();
    if (proposal) onProposal(proposal.id);
  }

  return (
    <Modal
      open={Boolean(mealId && recipe)}
      title={recipe ? `How did ${recipe.title} go?` : "Cooking review"}
      eyebrow="Mark cooked"
      onClose={onClose}
      wide
    >
      <div className="cooking-intro">
        <ChefHat size={25} />
        <div>
          <strong>Record what actually happened</strong>
          <p>
            “Actually used” updates pantry stock today. “Next time” improves
            the recipe proposal without changing today’s inventory.
          </p>
        </div>
      </div>

      <div className="adjustment-builder card">
        <div className="form-two">
          <label>
            Ingredient
            <select
              value={ingredientId}
              onChange={(event) => {
                setIngredientId(event.target.value);
                const ingredient = version?.ingredients.find(
                  (item) => item.id === event.target.value
                );
                if (ingredient) setUnit(ingredient.unit);
              }}
            >
              {version?.ingredients.map((ingredient) => (
                <option key={ingredient.id} value={ingredient.id}>
                  {ingredient.name}
                </option>
              ))}
              <option value="new">Something not in the recipe</option>
            </select>
          </label>
          {ingredientId === "new" ? (
            <label>
              New ingredient
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Smoked paprika"
              />
            </label>
          ) : (
            <label>
              Feedback applies to
              <SegmentedControl
                value={intent}
                options={[
                  { value: "actual", label: "Actually used" },
                  { value: "next-time", label: "Change next time" }
                ]}
                onChange={setIntent}
              />
            </label>
          )}
        </div>
        {ingredientId === "new" ? (
          <SegmentedControl
            value={intent}
            options={[
              { value: "actual", label: "Actually used" },
              { value: "next-time", label: "Change next time" }
            ]}
            onChange={setIntent}
          />
        ) : null}
        <div className="form-three">
          <label>
            Change
            <select
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as CookingAdjustment["kind"])
              }
              disabled={ingredientId === "new"}
            >
              <option value="more">Used / need more</option>
              <option value="less">Used / need less</option>
              <option value="skipped">Skipped it</option>
            </select>
          </label>
          <label>
            Amount
            <input
              value={quantity}
              disabled={kind === "skipped"}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="1/2"
            />
          </label>
          <label>
            Unit
            <input
              value={unit}
              disabled={ingredientId !== "new"}
              onChange={(event) => setUnit(event.target.value)}
            />
          </label>
        </div>
        {!quantity && kind !== "skipped" ? (
          <label>
            If you do not know the amount
            <select
              value={qualitative}
              onChange={(event) =>
                setQualitative(
                  event.target.value as NonNullable<
                    CookingAdjustment["qualitative"]
                  >
                )
              }
            >
              <option value="little">A little</option>
              <option value="some">Some extra</option>
              <option value="lot">A lot more</option>
              <option value="as-needed">As needed</option>
            </select>
          </label>
        ) : null}
        <button className="secondary-button" type="button" onClick={addAdjustment}>
          <Plus size={15} /> Add adjustment
        </button>
      </div>

      {adjustments.length ? (
        <div className="adjustment-list">
          {adjustments.map((adjustment) => (
            <div className="adjustment-chip" key={adjustment.id}>
              <span
                className={`intent-pill ${
                  adjustment.intent === "next-time" ? "future" : ""
                }`}
              >
                {adjustment.intent === "actual" ? "used" : "next time"}
              </span>
              <strong>
                {adjustment.name}: {adjustment.kind}{" "}
                {adjustment.quantity === null
                  ? adjustment.qualitative
                  : `${formatQuantity(adjustment.quantity)} ${
                      adjustment.unit === "count" ? "" : adjustment.unit
                    }`}
              </strong>
              <button
                className="mini-button"
                onClick={() =>
                  setAdjustments((current) =>
                    current.filter((item) => item.id !== adjustment.id)
                  )
                }
                aria-label="Remove adjustment"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <label>
        General cooking notes
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="The sauce thickened quickly; start the pasta a few minutes earlier."
        />
      </label>
      <div className="form-actions">
        <button className="secondary-button" onClick={onClose}>
          Cancel
        </button>
        <button className="primary-button" onClick={submit}>
          <Check size={16} /> Mark cooked
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
  const { state, reviewProposal } = useDemoStore();
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

  function review(status: "approved" | "ignored") {
    const result = reviewProposal(activeProposal.id, status, ingredients);
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
            <input
              value={ingredient.unit}
              onChange={(event) =>
                setIngredients((current) =>
                  current.map((candidate) =>
                    candidate.id === ingredient.id
                      ? { ...candidate, unit: event.target.value }
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
  const { state, switchMember, resetDemo } = useDemoStore();
  const [inviteEmail, setInviteEmail] = useState("");
  const [sending, setSending] = useState(false);

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
        body: JSON.stringify({
          email: inviteEmail,
          householdId: state.household.id
        })
      });
      if (!response.ok) throw new Error();
      notify(`Invitation prepared for ${inviteEmail}.`);
      setInviteEmail("");
    } catch {
      notify("Could not create the invitation.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="screen-header">
        <div>
          <p className="eyebrow">Cook together</p>
          <h1>Household</h1>
          <p>
            Individual accounts, one shared kitchen. Everyone here is an equal
            editor.
          </p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="settings-card card">
          <Home size={23} color="#315c4a" />
          <h3>{state.household.name}</h3>
          <p>
            Default plan: {state.household.defaultServings} servings · Week
            starts Sunday
          </p>
          {state.members.map((member) => (
            <div className="member-row" key={member.id}>
              <Avatar
                name={member.displayName}
                color={member.avatarColor}
              />
              <div className="row-main">
                <strong>{member.displayName}</strong>
                <span>{member.email} · Equal editor</span>
              </div>
              {member.id === state.currentMemberId ? (
                <span className="cooked-badge">You are here</span>
              ) : (
                <button
                  className="secondary-button"
                  onClick={() => {
                    switchMember(member.id);
                    notify(`Demo identity switched to ${member.displayName}.`);
                  }}
                >
                  Switch demo
                </button>
              )}
            </div>
          ))}
        </section>

        <section className="settings-card card">
          <Users size={23} color="#315c4a" />
          <h3>Invite someone</h3>
          <p>
            Production invitations are single-use, expire after seven days,
            and are tied to this household.
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
        </section>

        <section className="settings-card card">
          <Settings size={23} color="#315c4a" />
          <h3>Demo workspace</h3>
          <p>
            This browser-only workspace lets every MVP workflow run before
            Supabase credentials are connected.
          </p>
          <a className="secondary-button settings-link" href="/auth">
            Open account sign-in
          </a>
          <button
            className="danger-button"
            onClick={() => {
              resetDemo();
              notify("Demo data reset to the starter household.");
            }}
          >
            <RotateCcw size={16} /> Reset demo data
          </button>
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
    </>
  );
}
