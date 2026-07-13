import type { Metadata } from "next";

import { requireUser } from "@/lib/session";
import { Uploader } from "@/components/prepare/Uploader";

export const metadata: Metadata = { title: "New envelope" };

export default async function NewDocumentPage() {
  await requireUser();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <p className="text-sm font-medium text-brand-600 dark:text-brand-300">
          New envelope
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Upload a document
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Add a PDF to get started. On the next step you&apos;ll place signature
          and form fields, add recipients, and send it for signing.
        </p>
      </header>

      <Uploader />
    </main>
  );
}
