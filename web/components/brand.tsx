import { BRAND_MARKS, type BrandKey } from "@/lib/brand-marks";

/**
 * 브랜드 마크 하나.
 *
 * 전부 `currentColor` 를 따른다. 브랜드 컬러로 칠하지 않는 것은 미감의 문제가
 * 아니다 — 이 UI 는 모노톤이고 강조색은 **선택 상태**가 쓴다. 로고가 색을 들고
 * 오면 아무것도 선택하지 않았는데 일곱 개가 동시에 손을 드는 꼴이 된다.
 * 형태만으로 알아보게 하고, 색은 상태에 남겨 둔다.
 *
 * `aria-hidden` 인 이유: 마크 옆에는 언제나 이름 텍스트가 있다. 둘 다 읽히면
 * 스크린리더에서 "Anthropic Anthropic" 이 된다.
 */
export function Brand({
  name,
  className = "h-3.5 w-3.5",
}: {
  name: BrandKey;
  className?: string;
}) {
  const mark = BRAND_MARKS[name];
  return (
    <svg
      viewBox={mark.viewBox}
      fill="currentColor"
      aria-hidden
      className={`shrink-0 ${className}`}
      dangerouslySetInnerHTML={{ __html: mark.body }}
    />
  );
}

/**
 * 이름을 알 때만 마크를 붙인다. 모르면 아무것도 렌더하지 않는다 —
 * 자리를 지키려고 물음표 아이콘을 넣으면 "우리가 모른다"가 "그런 제공자다"로 읽힌다.
 */
export function BrandOrNothing({
  name,
  className,
}: {
  name: BrandKey | null;
  className?: string;
}) {
  return name ? <Brand name={name} className={className} /> : null;
}
