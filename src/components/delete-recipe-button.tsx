"use client";

import { deleteRecipe } from "@/actions/recipes";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function DeleteRecipeButton(props: { id: string }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      {show ? (
        <>
          <span className="text-sm text-stone-600">Delete this recipe?</span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await deleteRecipe(props.id);
                router.push("/recipes");
                router.refresh();
              })
            }
            className="rounded bg-red-700 px-3 py-1.5 text-sm text-white hover:bg-red-800 disabled:opacity-50"
          >
            {pending ? "…" : "Yes, delete"}
          </button>
          <button
            type="button"
            onClick={() => setShow(false)}
            className="text-sm text-stone-600"
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setShow(true)}
          className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-800"
        >
          Delete
        </button>
      )}
    </div>
  );
}
