import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function BlogListPage({ params }: { params: { studioSlug: string } }) {
  const studio = await prisma.studio.findUnique({ where: { slug: params.studioSlug } });
  if (!studio) notFound();

  const posts = await prisma.blogPost.findMany({
    where: { studioId: studio.id, published: true },
    orderBy: { publishedAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-serif text-3xl font-semibold">Blog</h1>
      <div className="mt-8 space-y-8">
        {posts.length === 0 && <p className="text-sm text-gray-500">Aucun article publié.</p>}
        {posts.map((post) => (
          <Link key={post.id} href={`/s/${studio.slug}/blog/${post.slug}`} className="block group">
            <h2 className="font-serif text-xl font-semibold group-hover:text-brand-600">
              {post.title}
            </h2>
            {post.excerpt && <p className="mt-1 text-sm text-gray-600">{post.excerpt}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}
