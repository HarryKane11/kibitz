#!/usr/bin/env node
/**
 * 브랜드 로고를 받아 `web/components/brand.tsx` 를 생성한다.
 *
 * 왜 생성기인가 — 세 가지 이유가 있다.
 *
 * 1. **런타임에 CDN 을 부르지 않는다.** Kibitz 는 자기 데이터를 밖으로 내보내지 않는
 *    것이 요점인 도구다. 대시보드가 페이지마다 제3자 도메인에 이미지를 요청하면
 *    그 요청 자체가 "누가 이 대시보드를 언제 보는지"를 남긴다. 에어갭 설치에서도
 *    깨진다. 그래서 빌드 시점에 받아 인라인한다.
 * 2. **출처와 라이선스를 코드에 남긴다.** 오픈소스로 배포하므로 각 마크가 어디서
 *    왔고 무슨 라이선스인지 파일에 적혀 있어야 한다.
 * 3. **단색으로 정규화한다.** 받은 SVG 는 제각각이다 — `fill="#fff"` 가 박혀 라이트
 *    배경에서 안 보이는 것(openai), `<style>` 클래스로 색을 넣은 것(langchain),
 *    이미 `currentColor` 인 것(claude-code). 손으로 붙여 넣으면 그중 하나를 놓친다.
 *
 * 실행: `node scripts/fetch-brand-icons.mjs`
 */

import { writeFile } from "node:fs/promises";

const BASE = "https://thesvg.org/icons";

/**
 * 받을 마크. `variant` 는 **단색 글리프가 나오는 것**으로 고른다 —
 * `mono` 가 늘 정답은 아니다. langchain 은 `mono` 가 흑백 두 색으로 그려져 있어
 * 구멍이 메워지고, `default` 가 오히려 한 색이다.
 */
const ICONS = [
  { key: "anthropic", slug: "anthropic", variant: "mono", license: "CC0-1.0" },
  { key: "openai", slug: "openai", variant: "dark", license: "MIT" },
  { key: "google", slug: "google", variant: "mono", license: "CC0-1.0" },
  { key: "openrouter", slug: "openrouter", variant: "mono", license: "CC0-1.0" },
  { key: "ollama", slug: "ollama", variant: "mono", license: "CC0-1.0" },
  { key: "claudeCode", slug: "claude-code", variant: "mono", license: "MIT" },
  { key: "codex", slug: "codex-openai", variant: "mono", license: "MIT" },
  { key: "langchain", slug: "langchain", variant: "default", license: "CC0-1.0" },
  {
    key: "opentelemetry",
    slug: "opentelemetry",
    variant: "mono",
    license: "CC-BY-4.0",
    attribution: "OpenTelemetry Authors",
  },
  { key: "langfuse", slug: "langfuse", variant: "mono", license: "MIT" },
  { key: "python", slug: "python", variant: "mono", license: "CC0-1.0" },
  { key: "typescript", slug: "typescript", variant: "mono", license: "CC0-1.0" },
  { key: "docker", slug: "docker", variant: "mono", license: "CC0-1.0" },
];

/** 받은 마크에서 `viewBox` 와 그리기 요소만 남기고 색을 벗긴다. */
function normalize(svg, key) {
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
  if (!viewBox) throw new Error(`${key}: no viewBox`);

  let body = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/<defs>[\s\S]*?<\/defs>/g, "")
    .replace(/\sclass="[^"]*"/g, "")
    // 색은 전부 버린다. `fill="none"` 만 남긴다 — 그건 색이 아니라 형태다
    // (외곽선만 그리는 path 를 채우면 글리프가 뭉갠다).
    .replace(/\s(?:fill|stroke)="(?!none)[^"]*"/g, "")
    .replace(/\s(?:width|height|style)="[^"]*"/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/#[0-9a-f]{3,8}|\brgb\(|\bwhite\b|\bblack\b/i.test(body)) {
    throw new Error(`${key}: 색이 남아 있다 — ${body.slice(0, 120)}`);
  }
  if (!body) throw new Error(`${key}: empty body`);

  // 이 문자열은 제3자 서버에서 받아 와 `dangerouslySetInnerHTML` 로 들어간다.
  // 빌드 시점이라 사용자 입력은 아니지만, 그쪽이 털리면 우리 번들에 스크립트가
  // 실린다. 도형이 아닌 것이 하나라도 보이면 생성 자체를 멈춘다 — 조용히
  // 걸러 내면 다음 사람이 필터를 믿고 검사를 건너뛴다.
  const forbidden = /<(script|foreignObject|use|image|a)\b|\son\w+=|href|javascript:|<!\[CDATA/i;
  const bad = body.match(forbidden);
  if (bad) throw new Error(`${key}: 도형이 아닌 것이 들어 있다 — ${bad[0]}`);
  const tags = [...body.matchAll(/<(\w[\w-]*)/g)].map((m) => m[1]);
  const ALLOWED = new Set([
    "path", "g", "circle", "ellipse", "rect", "polygon", "polyline", "line",
  ]);
  const unknown = tags.filter((tag) => !ALLOWED.has(tag));
  if (unknown.length) throw new Error(`${key}: 허용하지 않는 요소 — ${[...new Set(unknown)]}`);

  return { viewBox, body };
}

const marks = [];
for (const icon of ICONS) {
  const url = `${BASE}/${icon.slug}/${icon.variant}.svg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${icon.slug}: ${res.status} ${url}`);
  const { viewBox, body } = normalize(await res.text(), icon.key);
  marks.push({ ...icon, viewBox, body, url });
  console.log(`✓ ${icon.key.padEnd(14)} ${icon.license.padEnd(10)} ${body.length}B`);
}

const credits = marks
  .map((m) => `//   ${m.key.padEnd(14)} ${m.url}  (${m.license}${m.attribution ? `, © ${m.attribution}` : ""})`)
  .join("\n");

const entries = marks
  .map((m) => `  ${m.key}: {\n    viewBox: "${m.viewBox}",\n    body: '${m.body.replace(/'/g, "\\'")}',\n  },`)
  .join("\n");

const out = `// AUTO-GENERATED — 손으로 고치지 말고 \`node scripts/fetch-brand-icons.mjs\` 를 다시 돌린다.
//
// 브랜드 마크. 전부 단색으로 정규화되어 \`currentColor\` 를 따른다 — 라이트/다크
// 어느 쪽에서도 옆 글자와 같은 색으로 보인다. 받아서 인라인하는 이유와 variant
// 선택 근거는 scripts/fetch-brand-icons.mjs 주석에 있다.
//
// 출처 — thesvg.org:
${credits}
//
// 상표 사용: 각 마크는 **그 브랜드를 가리키는 용도로만** 쓴다 (제공자 선택, 소스
// 배지). Kibitz 자신의 표시로 쓰지 않는다.

export interface BrandMark {
  viewBox: string;
  body: string;
}

export const BRAND_MARKS = {
${entries}
} as const satisfies Record<string, BrandMark>;

export type BrandKey = keyof typeof BRAND_MARKS;
`;

const dest = new URL("../web/lib/brand-marks.ts", import.meta.url);
await writeFile(dest, out);
console.log(`\n→ web/lib/brand-marks.ts (${out.length}B, ${marks.length} marks)`);
