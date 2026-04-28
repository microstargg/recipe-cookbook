import { UrlImportForm } from "@/components/url-import-form";

export default function ImportUrlPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
        Import from URL
      </h1>
      <p className="mt-1 text-stone-600">
        Paste a link to a recipe page. You’ll review everything before it’s saved.
      </p>
      <div className="mt-8">
        <UrlImportForm />
      </div>
    </div>
  );
}
