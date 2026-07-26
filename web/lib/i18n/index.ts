import "server-only";
import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  dictionaryFor,
  isLocale,
  LOCALE_COOKIE,
  makeTranslate,
  type Locale,
  type Translate,
} from "@/lib/i18n/shared";

/** 서버 전용. 쿠키를 읽으므로 클라이언트 컴포넌트에서 import 하면 안 된다. */

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const v = store.get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** 서버 컴포넌트에서 바로 쓰는 번역 함수. */
export async function getT(): Promise<Translate & { locale: Locale }> {
  const locale = await getLocale();
  const t = makeTranslate(dictionaryFor(locale)) as Translate & { locale: Locale };
  t.locale = locale;
  return t;
}

export { dictionaryFor };
export type { Locale, Translate };
