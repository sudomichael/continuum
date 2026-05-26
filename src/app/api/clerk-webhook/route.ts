// Clerk webhook receiver.
//
// Subscribes to `user.created`, `user.updated`, `user.deleted` and keeps our
// local User table in sync. On `user.created` we also auto-provision a
// Workspace + WorkspaceMember so the user has somewhere to put data the
// instant they finish onboarding.
//
// Verification uses svix's HMAC check against CLERK_WEBHOOK_SECRET (set as a
// Vercel env var, value comes from the webhook endpoint's "Signing Secret"
// in Clerk's dashboard).
//
// Why a webhook and not a "create-on-first-request" server action:
// Clerk-signed webhooks are the canonical source of truth, fire even for
// SSO sign-ups that never hit our app shell, and give us delete events too.

import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { prisma } from "@/lib/db";

type ClerkUserEvent = {
  data: {
    id: string;
    email_addresses?: { email_address: string }[];
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string;
  };
  type: "user.created" | "user.updated" | "user.deleted";
};

function slugifyEmail(email: string): string {
  return (
    email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "workspace"
  );
}

async function uniqueWorkspaceSlug(base: string): Promise<string> {
  let slug = base;
  let n = 2;
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    slug = `${base}-${n++}`;
    if (n > 50) {
      slug = `${base}-${Date.now().toString(36)}`;
      break;
    }
  }
  return slug;
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CLERK_WEBHOOK_SECRET not configured" },
      { status: 500 },
    );
  }

  // svix expects raw text, not the parsed body — read it once for verify
  // and a second time for our handler.
  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let evt: ClerkUserEvent;
  try {
    evt = new Webhook(secret).verify(payload, headers) as ClerkUserEvent;
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid signature", detail: String(e) },
      { status: 400 },
    );
  }

  const data = evt.data;
  const email = data.email_addresses?.[0]?.email_address ?? null;
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;

  if (evt.type === "user.created") {
    // Provision User + Workspace + Membership + empty Settings.
    const baseSlug = email ? slugifyEmail(email) : data.id.slice(0, 8);
    const slug = await uniqueWorkspaceSlug(baseSlug);

    await prisma.$transaction([
      prisma.user.create({
        data: {
          externalId: data.id,
          email,
          name,
          imageUrl: data.image_url ?? null,
        },
      }),
      prisma.workspace.create({
        data: {
          slug,
          name: name ?? email ?? "Workspace",
          tier: "free",
          settings: { create: {} },
          members: {
            create: {
              user: { connect: { externalId: data.id } },
              role: "owner",
            },
          },
        },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }

  if (evt.type === "user.updated") {
    await prisma.user.update({
      where: { externalId: data.id },
      data: { email, name, imageUrl: data.image_url ?? null },
    });
    return NextResponse.json({ ok: true });
  }

  if (evt.type === "user.deleted") {
    // Cascade deletes via the schema (User → memberships → workspaces is
    // cascade-on-delete). We just remove the User; orphan workspaces are
    // a separate concern (team workspaces stay, personal workspaces vanish
    // when their sole owner does).
    await prisma.user
      .delete({ where: { externalId: data.id } })
      .catch(() => {});
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: evt.type });
}
