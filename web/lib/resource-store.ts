import "server-only";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { DATA_DIR } from "@/lib/paths";

export const RESOURCE_KINDS = [
  "prompts",
  "datasets",
  "evaluators",
  "queues",
  "automations",
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const RESOURCE_DIR =
  process.env.KIBITZ_RESOURCE_DIR ??
  join(/* turbopackIgnore: true */ dirname(DATA_DIR), "resources");

function pathOf(kind: ResourceKind): string {
  return join(/* turbopackIgnore: true */ RESOURCE_DIR, `${kind}.json`);
}

export function isResourceKind(value: string): value is ResourceKind {
  return RESOURCE_KINDS.includes(value as ResourceKind);
}

export function loadResources<T>(kind: ResourceKind, fallback: T[]): T[] {
  const path = pathOf(kind);
  if (!existsSync(/* turbopackIgnore: true */ path)) return fallback;
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(/* turbopackIgnore: true */ path, "utf8"),
    );
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch (error) {
    console.warn(`[kibitz] ${kind} resources could not be read`, error);
    return fallback;
  }
}

export function writeResources<T>(kind: ResourceKind, items: T[]): void {
  mkdirSync(/* turbopackIgnore: true */ RESOURCE_DIR, { recursive: true });
  const target = pathOf(kind);
  const temporary = join(
    /* turbopackIgnore: true */ RESOURCE_DIR,
    `.${kind}.${randomUUID()}.tmp`,
  );
  writeFileSync(/* turbopackIgnore: true */ temporary, JSON.stringify(items, null, 2), "utf8");
  renameSync(/* turbopackIgnore: true */ temporary, target);
}

export function upsertResource<T extends { id?: string; name?: string; project?: string }>(
  kind: ResourceKind,
  item: T,
): T[] {
  const key = item.id ?? item.name;
  if (!key) throw new Error("resource requires id or name");
  const current = loadResources<T>(kind, []);
  const index = current.findIndex(
    (candidate) =>
      (candidate.id ?? candidate.name) === key &&
      (!item.project || candidate.project === item.project),
  );
  const next = index >= 0
    ? current.map((candidate, i) => (i === index ? item : candidate))
    : [...current, item];
  writeResources(kind, next);
  return next;
}

export function deleteResource<
  T extends { id?: string; name?: string; project?: string },
>(
  kind: ResourceKind,
  key: string,
  project?: string,
): T[] {
  const next = loadResources<T>(kind, []).filter(
    (candidate) =>
      (candidate.id ?? candidate.name) !== key ||
      (Boolean(project) && candidate.project !== project),
  );
  writeResources(kind, next);
  return next;
}
