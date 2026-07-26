"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PageSpinner } from "@/components/ui/Spinner";

interface PostDTO {
  id: string;
  title: string;
  published: boolean;
  slug: string;
}

export default function BlogAdminPage() {
  const { t } = useLanguage();
  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [form, setForm] = useState({ title: "", excerpt: "", bodyHtml: "", published: true });
  const [loading, setLoading] = useState(false);
  // Chargement initial de la page (liste des articles) — distinct de `loading`, qui ne
  // couvre que la soumission du formulaire de publication.
  const [pageLoading, setPageLoading] = useState(true);

  function load() {
    fetch("/api/blog")
      .then((r) => r.json())
      .then((d) => setPosts(d.posts || []))
      .finally(() => setPageLoading(false));
  }
  useEffect(load, []);

  if (pageLoading) return <PageSpinner />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/blog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ title: "", excerpt: "", bodyHtml: "", published: true });
    setLoading(false);
    load();
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-2xl font-semibold">{t("blog.title")}</h1>

      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <input
          placeholder={t("blog.postTitle")}
          required
          className="input"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <input
          placeholder={t("blog.excerpt")}
          className="input"
          value={form.excerpt}
          onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
        />
        <textarea
          placeholder={t("blog.content")}
          required
          rows={8}
          className="input"
          value={form.bodyHtml}
          onChange={(e) => setForm({ ...form, bodyHtml: e.target.value })}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(e) => setForm({ ...form, published: e.target.checked })}
          />
          {t("blog.publishNow")}
        </label>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? t("blog.publishing") : t("blog.publish")}
        </button>
      </form>

      <div className="mt-8 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {posts.map((p) => (
          <div key={p.id} className="flex items-center justify-between p-4">
            <p className="font-medium">{p.title}</p>
            <span className="text-xs text-gray-500">{p.published ? t("blog.published") : t("blog.draft")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
