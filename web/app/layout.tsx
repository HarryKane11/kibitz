import type { Metadata } from "next";
import localFont from "next/font/local";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/components/i18n-provider";
import { dictionaryFor, getLocale } from "@/lib/i18n";
import "./globals.css";

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});
export const metadata: Metadata = {
  title: "Kibitz — Open-source tracing for long-running agents",
  description:
    "Capture complete agent runs, investigate hundreds of steps, and explain how the final outcome happened.",
};

/**
 * 테마를 첫 페인트 전에 결정하는 스크립트.
 *
 * 서버는 클라이언트의 취향을 알 수 없다. React 가 마운트된 뒤에 클래스를 붙이면
 * 라이트 사용자에게 다크 화면이 한 프레임 번쩍인다 — 그 깜빡임은 버그로 보인다.
 * 그래서 `<head>` 에서 동기로 실행한다.
 *
 * 저장값이 없으면 시스템 설정을 따른다. 실패하면(프라이빗 모드 등) 라이트로 둔다 —
 * `:root` 가 라이트이므로 아무것도 하지 않는 것이 곧 폴백이다.
 */
const THEME_SCRIPT = `(function(){try{
var s=localStorage.getItem('kibitz.theme');
if(s)s=s.replace(/"/g,'');
var dark=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
if(dark)document.documentElement.classList.add('dark');
}catch(e){}})()`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const dictionary = dictionaryFor(locale);

  return (
    // 스크립트가 className 을 바꾸므로 하이드레이션 경고를 억제한다 — 의도된 불일치다.
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${pretendard.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <I18nProvider locale={locale} dictionary={dictionary}>
          <TooltipProvider>{children}</TooltipProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
