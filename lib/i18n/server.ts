import { cookies } from "next/headers";
import { cache } from "react";
import { LOCALES, DEFAULT_LOCALE, type Locale } from "./config";
import { dictionaries, type Dictionary } from "./dictionaries";

export const getLocale = cache(async (): Promise<Locale> => {
  const c = await cookies();
  const v = c.get("locale")?.value;
  return (LOCALES as readonly string[]).includes(v ?? "")
    ? (v as Locale)
    : DEFAULT_LOCALE;
});

export async function getDictionary(): Promise<Dictionary> {
  return dictionaries[await getLocale()];
}
