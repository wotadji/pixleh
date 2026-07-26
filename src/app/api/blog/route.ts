import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";
import { slugify, randomSuffix } from "@/lib/slug";

export async function GET() {
  try {
    const session = await requireStudioSession();
    const posts = await prisma.blogPost.findMany({
      where: { studioId: session.user.studioId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ posts });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireStudioSession();
    const body = await req.json();
    if (!body.title || !body.bodyHtml) {
      return NextResponse.json({ error: "Titre et contenu requis" }, { status: 400 });
    }

    let slug = slugify(body.title);
    const existing = await prisma.blogPost.findUnique({
      where: { studioId_slug: { studioId: session.user.studioId, slug } },
    });
    if (existing) slug = `${slug}-${randomSuffix(4)}`;

    const post = await prisma.blogPost.create({
      data: {
        studioId: session.user.studioId,
        slug,
        title: body.title,
        excerpt: body.excerpt || null,
        bodyHtml: body.bodyHtml,
        published: !!body.published,
        publishedAt: body.published ? new Date() : null,
      },
    });
    return NextResponse.json({ post }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
}
