import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 셀프호스팅용 최소 번들.
   *
   * `standalone` 은 실제로 쓰이는 node_modules 만 추려 `.next/standalone` 에 담는다.
   * 이미지에 저장소 전체를 넣지 않아도 되므로 크기가 크게 줄고, 런타임에
   * `pnpm install` 이 필요 없다.
   */
  output: "standalone",
};

export default nextConfig;
