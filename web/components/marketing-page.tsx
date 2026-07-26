import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { SiteHeader } from "@/components/site-header";

export function MarketingPage({
  eyebrow,
  title,
  lede,
  image,
  imageAlt,
  caption,
  children,
  cta,
  ctaBody,
  docsLabel,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  image: string;
  imageAlt: string;
  caption: string;
  children: React.ReactNode;
  cta: string;
  ctaBody: string;
  docsLabel: string;
}) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-ink-900">
      <SiteHeader />
      <main id="main">
        <section className="relative border-b border-hair">
          <div className="brand-grid absolute inset-0 opacity-40" aria-hidden />
          <div className="relative mx-auto max-w-[1240px] px-5 pt-16 pb-14 sm:px-8 sm:pt-24">
            <p className="font-mono text-xs tracking-[0.08em] text-brand uppercase">{eyebrow}</p>
            <h1 className="mt-5 max-w-[15ch] text-[46px] leading-[1] font-bold tracking-[-0.05em] text-balance sm:text-[68px]">
              {title}
            </h1>
            <p className="mt-7 max-w-[70ch] text-lg leading-relaxed text-fg-2 sm:text-xl">
              {lede}
            </p>
            <figure className="mt-12 overflow-hidden rounded-xl border border-line bg-[#0a0b0d]">
              <Image
                src={image}
                alt={imageAlt}
                width={1600}
                height={900}
                priority
                sizes="(max-width: 1240px) 100vw, 1180px"
                className="h-auto w-full"
              />
              <figcaption className="border-t border-white/10 bg-[#0a0b0d] px-5 py-3 text-sm leading-relaxed text-[#aaa59b]">
                {caption}
              </figcaption>
            </figure>
          </div>
        </section>
        {children}
        <section className="border-t border-hair bg-fg text-ink-900">
          <div className="mx-auto grid max-w-[1240px] gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h2 className="max-w-[18ch] text-[36px] leading-[1.06] font-bold tracking-[-0.04em] sm:text-[48px]">
                {cta}
              </h2>
              <p className="mt-4 max-w-[64ch] text-base leading-relaxed text-ink-500">
                {ctaBody}
              </p>
            </div>
            <Link
              href="/docs"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink-900 px-5 font-mono text-xs font-semibold text-white focus-visible:ring-2"
            >
              {docsLabel}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

export function MarketingSection({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "muted";
}) {
  return (
    <section
      className={
        tone === "muted"
          ? "content-auto border-b border-hair bg-ink-800"
          : "content-auto border-b border-hair"
      }
    >
      <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 sm:py-24">{children}</div>
    </section>
  );
}

export function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="border-t border-line">
      {items.map((item) => (
        <li
          key={item}
          className="flex min-w-0 gap-3 border-b border-line py-4 text-base leading-relaxed text-fg-2"
        >
          <Check className="mt-1 h-4 w-4 shrink-0 text-brand" aria-hidden />
          <span className="min-w-0 break-words">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function NumberedFlow({
  items,
}: {
  items: { title: string; body: string }[];
}) {
  return (
    <ol className="border-t border-line">
      {items.map((item, index) => (
        <li
          key={item.title}
          className="grid gap-3 border-b border-line py-6 sm:grid-cols-[48px_200px_1fr]"
        >
          <span className="font-mono text-xs text-brand">{String(index + 1).padStart(2, "0")}</span>
          <h3 className="text-base font-semibold">{item.title}</h3>
          <p className="text-base leading-relaxed text-fg-2">{item.body}</p>
        </li>
      ))}
    </ol>
  );
}
