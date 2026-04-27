import { RecipeForm } from "@/components/recipe-form";

export default function NewRecipePage() {
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold text-ink">
        New recipe
      </h1>
      <p className="mt-1 text-stone-600">
        Add ingredients and steps. You can refine later.
      </p>
      <div className="mt-8">
        <RecipeForm />
      </div>
    </div>
  );
}
