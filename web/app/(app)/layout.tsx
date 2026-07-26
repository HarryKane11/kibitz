import { AppShell } from "@/components/app-shell";

/**
 * 앱 셸이 붙는 영역.
 *
 * 랜딩 페이지는 `(site)` 그룹에 있어 이 레이아웃을 받지 않는다. 셸을 pathname 으로
 * 조건부 렌더하면 모든 페이지가 클라이언트 컴포넌트를 하나 더 지나게 되고,
 * 그 조건은 라우트가 늘 때마다 틀린다.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
