import type { Metadata } from "next";

import { requireUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n/server";
import { Uploader } from "@/components/prepare/Uploader";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.sender.newEnvelope };
}

export default async function NewDocumentPage() {
  await requireUser();
  const t = await getDictionary();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <p className="text-sm font-medium text-brand-600 dark:text-brand-300">
          {t.sender.newEnvelope}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {t.sender.uploadDocumentTitle}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {t.sender.uploadDescription}
        </p>
      </header>

      <Uploader />
    </main>
  );
}
