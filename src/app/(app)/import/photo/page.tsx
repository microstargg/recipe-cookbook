import { PhotoImportForm } from "@/components/photo-import-form";

export default function ImportPhotoPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
        Import from photo
      </h1>
      <p className="mt-1 text-stone-600">
        Upload a photo or screenshot. AI suggests a structure you can edit before saving.
      </p>
      <div className="mt-8">
        <PhotoImportForm />
      </div>
    </div>
  );
}
