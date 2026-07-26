import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function BlogPostPage({
  params,
}: {
  params: { studioSlug: string; postSlug: string };
}) {
  const studio = await prisma.studio.findUnique({ where: { slug: params.studioSlug } });
  if (!studio) notFound();

  const post = await prisma.blogPost.findUnique({
    where: { studioId_slug: { studioId: studio.id, slug: params.postSlug } },
  });
  if (!post || !post.published) notFound();

  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-serif text-3xl font-semibold">{post.title}</h1>
      {post.publishedAt && (
        <p className="mt-2 text-sm text-gray-500">{post.publishedAt.toLocaleDateString("fr-FR")}</p>
      )}
      <div
        className="prose mt-8 max-w-none whitespace-pre-wrap leading-relaxed"
        dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
      />
    </article>
  );
}
