import { listQueues } from "@/lib/data";
import { getT } from "@/lib/i18n";
import { Page, PageHeader, EmptyState } from "@/components/page";
import { AnnotationWorkspace } from "@/components/annotation-workspace";

export default async function AnnotationPage() {
  const t = await getT();
  const queues = await listQueues();
  const queue = queues[0];

  return (
    <Page>
      <PageHeader title={t("annotation.title")} subtitle={t("annotation.subtitle")} />
      {!queue || queue.items.length === 0 ? (
        <EmptyState message={t("annotation.empty")} />
      ) : (
        <AnnotationWorkspace queue={queue} />
      )}
    </Page>
  );
}
