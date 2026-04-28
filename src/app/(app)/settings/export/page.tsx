import { exportAllRecipesForDownload } from "@/actions/export-data";

export default async function ExportPage() {
  const { json, markdown } = await exportAllRecipesForDownload();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Export</h1>
      <p className="mt-1 text-stone-600">
        Download everything you have stored — keep a copy outside this app.
      </p>
      <div className="mt-8 flex flex-col gap-4 sm:flex-row">
        <a
          href={`data:application/json;charset=utf-8,${encodeURIComponent(json)}`}
          download="recipes.json"
          className="inline-flex min-h-[48px] items-center justify-center rounded bg-sage px-4 py-3 text-base text-white hover:bg-sage/90 sm:min-h-0 sm:py-2 sm:text-sm"
        >
          Download JSON
        </a>
        <a
          href={`data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`}
          download="recipes.md"
          className="inline-flex min-h-[48px] items-center justify-center rounded border border-sage bg-white px-4 py-3 text-base text-sage hover:bg-cream sm:min-h-0 sm:py-2 sm:text-sm"
        >
          Download Markdown
        </a>
      </div>
      <p className="mt-6 text-sm text-stone-500">
        Tip: For large libraries, this page generates the file in the browser. If the
        download fails, reduce recipe count or add a streaming export later.
      </p>
    </div>
  );
}
