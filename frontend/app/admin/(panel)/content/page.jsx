"use client";

import { useState } from "react";
import { Badge, Button, Card, Checkbox, ErrorBox, Input, Loading, Modal, PageHeader, Select, Table, Textarea, confirmDialog } from "@/components/ui";
import { adminApi } from "@/lib/adminApi";
import { useAdminApi, useAdminMutation } from "@/lib/adminHooks";
import { usePaged } from "@/lib/usePaged";
import { formatDateTime } from "@/lib/format";

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);

function PostEditor({ postId, onClose }) {
  const existing = useAdminApi(["post", postId], `/admin/content/posts/${postId}`, undefined, { enabled: Boolean(postId) });
  const p = existing.data?.data;
  const [f, setF] = useState(null);
  const v = f ?? (p ? { ...p } : { type: "help", title: "", slug: "", excerpt: "", category: "", body: "", published: false });
  const set = (k) => (e) => setF({ ...v, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = useAdminMutation(
    () => {
      const body = { type: v.type, title: v.title, slug: v.slug || slugify(v.title), excerpt: v.excerpt || undefined, category: v.category || undefined, body: v.body, published: v.published };
      return postId ? adminApi.patch(`/admin/content/posts/${postId}`, body) : adminApi.post("/admin/content/posts", body);
    },
    { invalidate: ["posts"], onSuccess: onClose },
  );
  if (postId && existing.isLoading) return null;
  return (
    <Modal open onClose={onClose} title={postId ? "Edit article" : "New article"} size="lg">
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Type" value={v.type} onChange={set("type")} options={[{ value: "help", label: "Help Center article" }, { value: "blog", label: "Blog post" }]} />
        <Input label="Category (help)" placeholder="Getting started" value={v.category ?? ""} onChange={set("category")} />
        <Input label="Title" className="sm:col-span-2" value={v.title} onChange={set("title")} />
        <Input label="URL slug" placeholder={slugify(v.title || "my-article")} value={v.slug} onChange={set("slug")} />
        <Input label="Short summary" value={v.excerpt ?? ""} onChange={set("excerpt")} />
        <Textarea label="Text" className="sm:col-span-2" rows={14} value={v.body} onChange={set("body")} hint="Blank line = new paragraph. Lines starting with # or ## are headings, - for bullet lists, 1. for numbered lists." />
        <Checkbox label="Published (visible on the website)" checked={v.published} onChange={set("published")} />
      </div>
      <Button className="mt-4" loading={save.isPending} disabled={v.title.length < 3 || v.body.length < 10} onClick={() => save.mutate()}>
        Save
      </Button>
    </Modal>
  );
}

export default function ContentPage() {
  const [editing, setEditing] = useState(null); // null | "new" | id
  const posts = usePaged("posts", "/admin/content/posts", {}, { client: "admin", defaultLimit: 50 });
  const remove = useAdminMutation((id) => adminApi.delete(`/admin/content/posts/${id}`), { invalidate: ["posts"] });

  return (
    <div className="space-y-4">
      <PageHeader title="Website content" subtitle="Help Center articles and blog posts on the website" actions={<Button onClick={() => setEditing("new")}>+ New article</Button>} />
      <Card>
        {posts.isLoading ? (
          <Loading />
        ) : (
          <>
            <Table pager={posts.pager}
              rows={posts.data?.data ?? []}
              empty="No articles yet."
              onRowClick={(p) => setEditing(p._id)}
              columns={[
                { key: "title", header: "Title", render: (p) => <strong>{p.title}</strong> },
                { key: "type", header: "Type", render: (p) => <Badge color={p.type === "help" ? "blue" : "purple"}>{p.type}</Badge> },
                { key: "category", header: "Category" },
                { key: "published", header: "", render: (p) => <Badge color={p.published ? "green" : "slate"}>{p.published ? "published" : "draft"}</Badge> },
                { key: "updatedAt", header: "Updated", render: (p) => formatDateTime(p.updatedAt) },
                {
                  key: "x",
                  header: "",
                  render: (p) => (
                    <Button size="sm" variant="danger" onClick={(e) => (e.stopPropagation(), confirmDialog(`Delete "${p.title}"?`).then((ok) => ok && remove.mutate(p._id)))}>
                      Delete
                    </Button>
                  ),
                },
              ]}
            />
          </>
        )}
      </Card>
      {editing && <PostEditor postId={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
