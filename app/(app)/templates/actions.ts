"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { documents } from "@/db/schema";
import { getCurrentUser, isAdminEmail } from "@/lib/session";
import { getDictionary } from "@/lib/i18n/server";
import { cloneEnvelope } from "@/lib/templates";
import type { User } from "@/db/schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function adminUser(): Promise<User | null> {
  const user = await getCurrentUser();
  return user && isAdminEmail(user.email) ? user : null;
}

/**
 * Snapshot an existing envelope as a reusable template. Ownership-checked. The
 * clone keeps the PDF and field/recipient layout but strips recipient PII.
 */
export async function saveAsTemplate(
  documentId: string,
): Promise<ActionResult> {
  const t = await getDictionary();
  const user = await adminUser();
  if (!user) return { ok: false, error: t.sender.forbidden };

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, user.id)))
    .limit(1);
  if (!doc) return { ok: false, error: t.templates.envelopeNotFound };

  try {
    await cloneEnvelope(documentId, { userId: user.id, asTemplate: true });
  } catch (err) {
    console.error(`[saveAsTemplate] ${documentId} failed:`, err);
    return { ok: false, error: t.templates.saveError };
  }

  revalidatePath("/templates");
  return { ok: true };
}

/**
 * Start a fresh draft from a template and send the sender straight to the
 * prepare screen to fill in real recipients. Ownership-checked. On success this
 * redirects and does not return.
 */
export async function createDraftFromTemplate(
  templateId: string,
): Promise<ActionResult> {
  const t = await getDictionary();
  const user = await adminUser();
  if (!user) return { ok: false, error: t.sender.forbidden };

  const [tpl] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, templateId),
        eq(documents.userId, user.id),
        eq(documents.isTemplate, true),
      ),
    )
    .limit(1);
  if (!tpl) return { ok: false, error: t.templates.templateNotFound };

  let newDocId: string;
  try {
    newDocId = await cloneEnvelope(templateId, {
      userId: user.id,
      asTemplate: false,
    });
  } catch (err) {
    console.error(`[createDraftFromTemplate] ${templateId} failed:`, err);
    return { ok: false, error: t.templates.useError };
  }

  redirect(`/documents/${newDocId}/prepare`);
}

/**
 * Delete a template. Ownership- and type-checked so a live envelope can never
 * be removed through this path. Cascades to its recipients/fields/groups.
 */
export async function deleteTemplate(
  templateId: string,
): Promise<ActionResult> {
  const t = await getDictionary();
  const user = await adminUser();
  if (!user) return { ok: false, error: t.sender.forbidden };

  const [tpl] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, templateId),
        eq(documents.userId, user.id),
        eq(documents.isTemplate, true),
      ),
    )
    .limit(1);
  if (!tpl) return { ok: false, error: t.templates.templateNotFound };

  await db.delete(documents).where(eq(documents.id, templateId));

  revalidatePath("/templates");
  return { ok: true };
}
