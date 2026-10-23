"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import InternalHeader from "@/components/InternalHeader";
import { Button, buttonVariants } from "@/components/ui/button";
import type { PhotoReviewItem, PhotoSubmissionStatus } from "@/lib/photo-submissions";

type ReviewStatus = "approved" | "rejected";
type Filter = PhotoSubmissionStatus | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

export default function PhotoReview({
  preview = false,
  initialItems = null,
}: {
  preview?: boolean;
  initialItems?: PhotoReviewItem[] | null;
}) {
  if (preview) return <PhotoReviewPreview items={initialItems ?? []} />;
  return <PhotoReviewLive />;
}

function PhotoReviewPreview({ items }: { items: PhotoReviewItem[] }) {
  const [current, setCurrent] = useState(items);
  return (
    <PhotoReviewFrame
      preview
      items={current}
      onReview={(id, status) => {
        setCurrent((rows) => rows.map((row) => (
          row.id === id
            ? { ...row, status, reviewedAt: new Date().toISOString(), reviewedBy: "preview@example.com" }
            : row
        )));
      }}
    />
  );
}

function PhotoReviewLive() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const query = useQuery<{ submissions: PhotoReviewItem[] }>({
    queryKey: ["photo-submissions"],
    queryFn: async () => {
      const response = await fetch("/api/photo-submissions");
      if (!response.ok) throw new Error("Photos couldn't be loaded.");
      return response.json();
    },
  });

  async function onReview(id: string, status: ReviewStatus) {
    setActionError(null);
    setPendingId(id);
    try {
      const response = await fetch(`/api/photo-submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        setActionError("That update didn't save.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["photo-submissions"] });
    } catch {
      setActionError("That update didn't save.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <PhotoReviewFrame
      items={query.data?.submissions ?? []}
      loading={query.isLoading}
      error={actionError || (query.isError ? "Photos couldn't be loaded." : null)}
      pendingId={pendingId}
      onReview={onReview}
    />
  );
}

function PhotoReviewFrame({
  preview = false,
  items,
  loading = false,
  error = null,
  pendingId = null,
  onReview,
}: {
  preview?: boolean;
  items: PhotoReviewItem[];
  loading?: boolean;
  error?: string | null;
  pendingId?: string | null;
  onReview: (id: string, status: ReviewStatus) => void;
}) {
  const [filter, setFilter] = useState<Filter>("pending");
  const visible = items.filter((item) => filter === "all" || item.status === filter);

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-orange-50/30 to-amber-50/20" data-testid="photo-review">
      <InternalHeader title="Photo submissions" subtitle="Private until you approve them" />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {preview ? (
          <p className="mb-4 text-sm text-stone-600">Sample photos for layout preview. These are not real submissions.</p>
        ) : null}
        <div className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <Button
              key={item.value}
              type="button"
              variant="outline"
              data-testid={`photo-filter-${item.value}`}
              className={filter === item.value ? "border-amber-600 bg-amber-50 text-amber-800" : "border-stone-200"}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        {error ? <p role="alert" className="mb-4 text-sm text-stone-700">{error}</p> : null}
        {loading ? <p className="text-sm text-stone-600">Loading photos…</p> : null}
        {!loading && visible.length === 0 ? (
          <p className="text-sm text-stone-600">No photos in this list.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((item) => (
              <li key={item.id} data-testid={`photo-card-${item.id}`} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                <PhotoThumb item={item} />
                <div className="space-y-3 p-4">
                  <div>
                    <p className="break-all text-sm font-medium text-slate-800">{item.email}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {format(new Date(item.createdAt), "MMM d, yyyy")}
                      {" · "}
                      <span className="capitalize">{item.status}</span>
                    </p>
                    <p className="mt-1 text-xs text-stone-600">
                      Instagram {item.instagramHandle ? `@${item.instagramHandle}` : "—"}
                    </p>
                    <p className="text-xs text-stone-600">
                      Film stock {item.filmStock || "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      data-testid={`approve-${item.id}`}
                      disabled={pendingId === item.id || item.status === "approved"}
                      className="bg-amber-600 text-white hover:bg-amber-700"
                      onClick={() => onReview(item.id, "approved")}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      data-testid={`reject-${item.id}`}
                      disabled={pendingId === item.id || item.status === "rejected"}
                      onClick={() => onReview(item.id, "rejected")}
                    >
                      Reject
                    </Button>
                    <a
                      href={preview ? (item.thumbnailUrl || "/logo.png") : `/api/photo-submissions/${item.id}/download`}
                      download={preview ? `yours-photo-${item.id}.${item.extension === "other" ? "jpg" : item.extension}` : undefined}
                      className={buttonVariants({ variant: "outline" })}
                    >
                      Download
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function PhotoThumb({ item }: { item: PhotoReviewItem }) {
  if (item.extension === "heic" || !item.thumbnailUrl) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center bg-stone-100 text-sm font-medium text-stone-600">
        {item.extension === "heic" ? "HEIC preview unavailable" : "Preview unavailable"}
      </div>
    );
  }
  return (
    // Signed URLs change every hour and are not in next/image remote patterns.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.thumbnailUrl}
      alt={`Photo from ${item.email}`}
      className="aspect-[4/3] w-full bg-stone-100 object-cover"
    />
  );
}
