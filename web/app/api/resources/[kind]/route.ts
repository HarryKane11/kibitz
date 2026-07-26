import { NextResponse } from "next/server";
import { authorizeIngest, authorizeRead, projectScope } from "@/lib/api";
import {
  deleteResource,
  isResourceKind,
  loadResources,
  upsertResource,
  writeResources,
} from "@/lib/resource-store";

type Resource = { id?: string; name?: string; project?: string; [key: string]: unknown };

function inProject(items: Resource[], project?: string): Resource[] {
  return project ? items.filter((item) => item.project === project) : items;
}

async function kindOf(ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  return isResourceKind(kind) ? kind : null;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ kind: string }> },
) {
  const denied = authorizeRead(req);
  if (denied) return denied;
  const kind = await kindOf(ctx);
  if (!kind) return NextResponse.json({ error: "unknown resource kind" }, { status: 404 });
  const items = inProject(loadResources<Resource>(kind, []), projectScope(req));
  return NextResponse.json({ count: items.length, items });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ kind: string }> },
) {
  const denied = authorizeIngest(req);
  if (denied) return denied;
  const kind = await kindOf(ctx);
  if (!kind) return NextResponse.json({ error: "unknown resource kind" }, { status: 404 });
  const scope = projectScope(req);
  const submitted = (await req.json()) as Resource;
  const item = scope ? { ...submitted, project: scope } : submitted;
  try {
    const items = upsertResource(kind, item);
    return NextResponse.json(
      { item, count: inProject(items, scope).length },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "invalid resource" },
      { status: 400 },
    );
  }
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ kind: string }> },
) {
  const denied = authorizeIngest(req);
  if (denied) return denied;
  const kind = await kindOf(ctx);
  if (!kind) return NextResponse.json({ error: "unknown resource kind" }, { status: 404 });
  const body = (await req.json()) as unknown;
  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "expected an array" }, { status: 400 });
  }
  const scope = projectScope(req);
  const submitted = body as Resource[];
  if (!scope) {
    writeResources(kind, submitted);
    return NextResponse.json({ count: submitted.length });
  }
  const existing = loadResources<Resource>(kind, []).filter(
    (item) => item.project !== scope,
  );
  const scoped = submitted.map((item) => ({ ...item, project: scope }));
  writeResources(kind, [...existing, ...scoped]);
  return NextResponse.json({ count: scoped.length });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ kind: string }> },
) {
  const denied = authorizeIngest(req);
  if (denied) return denied;
  const kind = await kindOf(ctx);
  if (!kind) return NextResponse.json({ error: "unknown resource kind" }, { status: 404 });
  const key = new URL(req.url).searchParams.get("id");
  if (!key) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const scope = projectScope(req);
  const current = loadResources<Resource>(kind, []);
  const target = current.find((item) => (item.id ?? item.name) === key);
  if (scope && target?.project !== scope) {
    return NextResponse.json({ error: "resource not found" }, { status: 404 });
  }
  const items = deleteResource<Resource>(kind, key, scope);
  return NextResponse.json({
    deleted: key,
    count: inProject(items, scope).length,
  });
}
