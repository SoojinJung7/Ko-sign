import { en } from "./locales/en";
import { ko } from "./locales/ko";
import type { Locale } from "./config";

export type Dictionary = typeof en;

export const dictionaries: Record<Locale, Dictionary> = { en, ko };
