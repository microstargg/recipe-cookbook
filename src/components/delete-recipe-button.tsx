"use client";

import { deleteRecipe } from "@/actions/recipes";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function DeleteRecipeButton(props: { id: string }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
      {show ? (
        <>
          <span className="text-sm text-stone-600 max-sm:order-last">
            Delete this recipe?
          </span>
          <div className="flex flex-wrap gap-2">
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
              className="min-h-[44px] rounded bg-red-700 px-4 py-2 text-sm text-white hover:bg-red-800 disabled:opacity-50 sm:min-h-0 sm:px-3 sm:py-1.5"
            >
              {pending ? "…" : "Yes, delete"}
            </button>
            <button
              type="button"
              onClick={() => setShow(false)}
              className="min-h-[44px] rounded border border-stone-300 px-4 py-2 text-sm text-stone-600 sm:min-h-0 sm:border-0 sm:px-3 sm:py-1.5"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setShow(true)}
          className="w-full min-h-[44px] rounded border border-red-200 px-4 py-2 text-sm text-red-800 sm:w-auto sm:min-h-0 sm:px-3 sm:py-1.5"
        >
          Delete
        </button>
      )}
    </div>
  );
}
