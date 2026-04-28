import { notFound } from "next/navigation";
import { getRecipe } from "@/actions/recipes";
import { RecipeForm } from "@/components/recipe-form";

type Props = { params: Promise<{ id: string }> };

export default async function EditRecipePage({ params }: Props) {
  const { id } = await params;
  const data = await getRecipe(id);
  if (!data) notFound();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
        Edit recipe
      </h1>
      <div className="mt-8">
        <RecipeForm
          initial={{
            id: data.id,
            title: data.title,
            ingredients: data.ingredients,
            steps: data.steps,
            tags: data.tags ?? [],
            sourceUrl: data.sourceUrl ?? undefined,
            notes: data.notes ?? undefined,
          }}
          submitLabel="Update recipe"
        />
      </div>
    </div>
  );
}
