import Link from "next/link";
import { notFound } from "next/navigation";
import { getRecipe } from "@/actions/recipes";
import { DeleteRecipeButton } from "@/components/delete-recipe-button";

type Props = { params: Promise<{ id: string }> };

export default async function RecipeDetailPage({ params }: Props) {
  const { id } = await params;
  const data = await getRecipe(id);
  if (!data) notFound();

  return (
    <article>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">
            {data.title}
          </h1>
          {data.sourceUrl && (
            <p className="mt-2 text-sm">
              <a
                href={data.sourceUrl}
                className="text-accent underline"
                target="_blank"
                rel="noreferrer"
              >
                Original link
              </a>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href={`/recipes/${id}/edit`}
            className="rounded border border-stone-300 px-3 py-1.5 text-sm"
          >
            Edit
          </Link>
          <DeleteRecipeButton id={id} />
        </div>
      </div>

      {data.images.length > 0 && (
        <ul className="mb-8 flex flex-wrap gap-2">
          {data.images.map((im) => (
            <li key={im.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={im.url}
                alt=""
                className="max-h-64 max-w-full rounded border border-stone-200"
              />
            </li>
          ))}
        </ul>
      )}

      <section className="mb-8">
        <h2 className="font-medium text-ink">Ingredients</h2>
        <ul className="mt-2 list-disc pl-5 text-stone-800">
          {data.ingredients.map((i, j) => (
            <li key={j}>{i}</li>
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="font-medium text-ink">Steps</h2>
        <ol className="mt-2 list-decimal pl-5 text-stone-800">
          {data.steps.map((s, j) => (
            <li key={j} className="mb-2">
              {s}
            </li>
          ))}
        </ol>
      </section>

      {data.tags && data.tags.length > 0 && (
        <p className="mb-4 text-sm text-stone-600">
          <span className="font-medium">Tags: </span>
          {data.tags.join(", ")}
        </p>
      )}

      {data.notes && (
        <section>
          <h2 className="font-medium text-ink">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-stone-700">{data.notes}</p>
        </section>
      )}
    </article>
  );
}
