import { notFound } from "next/navigation";
import { getPrompt } from "@/lib/data";
import { getT } from "@/lib/i18n";
import { Page, PageHeader, Crumbs } from "@/components/page";
import { PromptVersions } from "@/components/prompt-versions";

export default async function PromptDetailPage(props: PageProps<"/prompts/[promptName]">) {
  const { promptName } = await props.params;
  const name = decodeURIComponent(promptName);
  const t = await getT();
  const prompt = await getPrompt(name);
  if (!prompt) notFound();

  return (
    <Page>
      <Crumbs items={[{ label: t("prompts.title"), href: "/prompts" }, { label: name }]} />
      <PageHeader
        title={name}
        subtitle={prompt.type === "chat" ? t("prompts.typeChat") : t("prompts.typeText")}
      />
      <PromptVersions prompt={prompt} />
    </Page>
  );
}
