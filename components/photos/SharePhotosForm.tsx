"use client";

import { useState, type FormEvent } from "react";
import WindowFrame from "@/components/WindowFrame";
import {
  formPermissionGranted,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_FILES,
  PHOTO_HONEYPOT_FIELD,
  PHOTO_PERMISSION_ERROR,
  PHOTO_PERMISSION_LABEL,
  PHOTO_SAVE_ERROR,
  PHOTO_SUBMITTED_MESSAGE,
  detectPhotoFile,
  photoByteSizeAllowed,
} from "@/lib/photo-submissions";
import { isValidEmail, normalizeEmail } from "@/lib/validation";

const fieldClass =
  "mt-1 w-full rounded-xl border-2 border-neutral-900 bg-white px-3 py-2.5 font-jetbrains text-sm text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2";

const submitClass =
  "inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#A1CC93] px-5 font-jetbrains text-sm font-bold text-neutral-900 transition-colors hover:bg-[#8fbe80] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

export default function SharePhotosForm({ mode }: { mode: "account" | "public" }) {
  const [names, setNames] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function onFiles(files: FileList | null) {
    setNames(Array.from(files ?? []).map((file) => file.name).slice(0, MAX_PHOTO_FILES));
    setError(null);
    setMessage(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);

    if (mode === "public" && !isValidEmail(normalizeEmail(String(data.get("email") ?? "")))) {
      setError("Enter an email address.");
      return;
    }
    if (!formPermissionGranted(data)) {
      setError(PHOTO_PERMISSION_ERROR);
      return;
    }
    const localError = await clientFileError(data);
    if (localError) {
      setError(localError);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(mode === "account" ? "/api/account/photo-submissions" : "/api/photo-submissions", {
        method: "POST",
        body: data,
      });
      const body = await response.json().catch(() => null) as { message?: string; error?: string } | null;
      if (!response.ok) {
        setError(body?.error || PHOTO_SAVE_ERROR);
        return;
      }
      setMessage(body?.message || PHOTO_SUBMITTED_MESSAGE);
      form.reset();
      setNames([]);
    } catch {
      setError(PHOTO_SAVE_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <WindowFrame title="Share your photos" titleAs="h2" titleId="share-photos-title" bodyClassName="space-y-4 p-4 sm:p-5">
      <form
        data-testid="share-photos"
        aria-labelledby="share-photos-title"
        onSubmit={onSubmit}
        className="relative space-y-4"
      >
        <p className="font-jetbrains text-sm leading-relaxed text-neutral-900">
          Send a few photos from your rolls. We keep them private until the shop approves them.
        </p>

        {mode === "public" ? (
          <div>
            <label htmlFor="share-photos-email" className="font-jetbrains text-sm font-bold text-neutral-900">
              Email
            </label>
            <input
              id="share-photos-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className={fieldClass}
            />
          </div>
        ) : null}

        <div>
          <label
            htmlFor="share-photos-files"
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-900 bg-[#FFF6D3] px-4 py-6 text-center font-jetbrains text-sm font-bold text-neutral-900 focus-within:ring-2 focus-within:ring-neutral-900 focus-within:ring-offset-2"
          >
            Choose photos
            <span className="mt-1 font-normal">JPG, PNG, or HEIC. Up to 10 photos, 15 MB each.</span>
          </label>
          <input
            id="share-photos-files"
            name="photos"
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif"
            multiple
            className="sr-only"
            onChange={(event) => onFiles(event.target.files)}
          />
          {names.length ? (
            <ul className="mt-3 space-y-1 font-jetbrains text-sm text-neutral-900">
              {names.map((name, index) => (
                <li key={`${name}-${index}`}>{name}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 font-jetbrains text-sm text-neutral-900">No photos chosen yet.</p>
          )}
        </div>

        <label className="flex items-start gap-3 font-jetbrains text-sm leading-relaxed text-neutral-900">
          <input
            id="share-photos-permission"
            data-testid="share-photos-permission"
            name="permission"
            type="checkbox"
            required
            className="mt-1 size-4 shrink-0 accent-neutral-900"
          />
          <span>{PHOTO_PERMISSION_LABEL}</span>
        </label>

        {mode === "public" ? (
          <div aria-hidden="true" className="h-0 overflow-hidden">
            <label>
              Company website
              <input
                type="text"
                name={PHOTO_HONEYPOT_FIELD}
                tabIndex={-1}
                autoComplete="off"
                defaultValue=""
              />
            </label>
          </div>
        ) : null}

        <button type="submit" data-testid="share-photos-submit" className={submitClass} disabled={submitting}>
          {submitting ? "Sending…" : "Submit"}
        </button>

        {error ? (
          <p role="alert" className="font-jetbrains text-sm leading-relaxed text-neutral-900">{error}</p>
        ) : null}
        {message ? (
          <p role="status" className="font-jetbrains text-sm leading-relaxed text-neutral-900">{message}</p>
        ) : null}
      </form>
    </WindowFrame>
  );
}

async function clientFileError(form: FormData): Promise<string | null> {
  const files = form.getAll("photos").filter((entry): entry is File => entry instanceof File && (entry.size > 0 || entry.name.trim() !== ""));
  if (files.length === 0) return "Choose at least one photo.";
  if (files.length > MAX_PHOTO_FILES) return "You can send up to 10 photos at a time.";
  for (const file of files) {
    if (file.size > MAX_PHOTO_BYTES) return "Each photo must be 15 MB or smaller.";
    if (!photoByteSizeAllowed(file.size)) return "Use a JPG, PNG, or HEIC photo.";
    const detected = detectPhotoFile(new Uint8Array(await file.arrayBuffer()));
    if (!detected.ok) return detected.error;
  }
  return null;
}
