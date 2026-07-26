import {
  DEFAULT_LOCALE,
  DICTIONARIES,
  type Dictionary,
  type Locale,
  LOCALES,
} from "@/lib/i18n/dictionaries";

/**
 * 서버·클라이언트가 함께 쓰는 부분.
 *
 * `next/headers` 는 여기 들어오면 안 된다 — 클라이언트 컴포넌트가 이 모듈을
 * import 하는 순간 번들이 깨진다. 쿠키를 읽는 쪽은 `lib/i18n/index.ts` 에 있다.
 */

export const LOCALE_COOKIE = "kibitz_locale";

export type Namespace = keyof Dictionary;
/** `"traces.title"` 같은 점 표기 키. `en` 에서 파생되므로 오타가 컴파일에서 잡힌다. */
export type MessageKey = {
  [N in Namespace]: `${N & string}.${keyof Dictionary[N] & string}`;
}[Namespace];

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * 자리표시자를 채운다. 없는 키는 키 자체를 돌려줘 화면에서 바로 눈에 띈다.
 *
 * 단수 처리: `n` 이 1 이면 `<키>_one` 을 먼저 찾는다. 영어는 "1 turns saved"
 * 같은 문장이 그대로 나가면 제품이 조잡해 보이고, 한국어는 수 구분이 없어
 * 같은 문자열을 그냥 한 번 더 적으면 된다. 규칙을 여기 한 곳에 두면
 * 호출부는 단복수를 신경 쓰지 않아도 된다.
 */
export function makeTranslate(dict: Dictionary): Translate {
  const lookup = (key: string): string | undefined => {
    const [ns, k] = key.split(".") as [Namespace, string];
    return (dict[ns] as Record<string, string> | undefined)?.[k];
  };

  return (key, vars) => {
    const one = vars !== undefined && Number(vars.n) === 1 ? lookup(`${key}_one`) : undefined;
    const raw = one ?? lookup(key);
    if (raw === undefined) return key;
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (m, name: string) =>
      name in vars ? String(vars[name]) : m,
    );
  };
}

export function isLocale(v: string | undefined): v is Locale {
  return !!v && (LOCALES as string[]).includes(v);
}

export function dictionaryFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale] as Dictionary;
}

export { DEFAULT_LOCALE, LOCALES };
export type { Dictionary, Locale };
