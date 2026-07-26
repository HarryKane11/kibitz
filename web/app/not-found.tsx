import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getT } from "@/lib/i18n";
import { Page } from "@/components/page";

/**
 * 404.
 *
 * Next 기본 화면은 밝은 배경에 시스템 폰트라 이 앱 안에서 사고처럼 보인다.
 * 없는 트레이스 id 로 들어오는 일은 흔하므로 정상 화면 취급한다.
 */
export default async function NotFound() {
  const t = await getT();

  return (
    <Page>
      <div className="flex flex-col items-start gap-5 py-24">
        <p className="font-mono text-sm text-fg-3">404</p>
        <h1 className="max-w-xl text-3xl font-semibold tracking-tight">
          {t("common.notFoundTitle")}
        </h1>
        <p className="max-w-xl text-base text-fg-2">{t("common.notFoundBody")}</p>
        <Link
          href="/traces"
          className="mt-2 flex items-center gap-2 rounded-full border border-line px-4 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:border-line-3 hover:text-fg"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {t("traces.title")}
        </Link>
      </div>
    </Page>
  );
}
