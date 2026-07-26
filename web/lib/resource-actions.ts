"use server";

import type { AnnotationQueue } from "@/lib/types";
import { upsertResource } from "@/lib/resource-store";

export async function saveAnnotationQueue(queue: AnnotationQueue): Promise<void> {
  upsertResource("queues", queue);
}
