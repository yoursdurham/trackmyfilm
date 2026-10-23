import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AccountProfile from "@/components/account/AccountProfile";
import SharePhotosForm from "@/components/photos/SharePhotosForm";
import PhotoReview from "@/components/photos/PhotoReview";
import { previewAccountProfile } from "@/lib/account-profile";
import { PHOTO_HONEYPOT_FIELD, PHOTO_PERMISSION_LABEL, previewPhotoReviewItems, type PhotoReviewItem } from "@/lib/photo-submissions";

describe("Share your photos", () => {
  it("asks the signed-in account for photos, permission, and optional instagram and film stock", () => {
    const html = renderToStaticMarkup(<SharePhotosForm mode="account" />);
    expect(html).toContain("Share your photos");
    expect(html).toContain(PHOTO_PERMISSION_LABEL);
    expect(html).toContain(">Submit<");
    expect(html).toContain('name="photos"');
    expect(html).toContain("Instagram (optional)");
    expect(html).toContain('id="share-photos-instagram"');
    expect(html).toContain('maxLength="31"');
    expect(html).toContain("Film stock (optional)");
    expect(html).toContain('id="share-photos-film"');
    expect(html).toContain('list="share-photos-film-stocks"');
    expect(html).toContain('maxLength="60"');
    expect(html).toContain('value="Kodak Portra 400"');
    expect(html).not.toContain('id="share-photos-email"');
    expect(html).not.toContain(PHOTO_HONEYPOT_FIELD);
    expect(html).toContain("bg-[#DDB1B1]");

    const profile = renderToStaticMarkup(<AccountProfile profile={previewAccountProfile()} />);
    const contact = profile.indexOf('data-testid="contact"');
    const share = profile.indexOf('data-testid="share-photos-section"');
    expect(share).toBeGreaterThan(contact);
    expect(profile).not.toContain('id="share-photos-email"');
  });

  it("asks the public page for an email and hides a honeypot", () => {
    const html = renderToStaticMarkup(<SharePhotosForm mode="public" />);
    expect(html).toContain('id="share-photos-email"');
    expect(html).toContain('name="email"');
    expect(html).toContain(`name="${PHOTO_HONEYPOT_FIELD}"`);
    expect(html).toContain(PHOTO_PERMISSION_LABEL);
    expect(html).toContain(">Submit<");
    expect(html).toContain("Instagram (optional)");
    expect(html).toContain("Film stock (optional)");
    expect(html).toContain('value="Kodak Portra 400"');
  });

  it("shows sample submissions with approve, reject, and download", () => {
    const client = new QueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <PhotoReview preview initialItems={previewPhotoReviewItems()} />
      </QueryClientProvider>,
    );
    expect(html).toContain("Photo submissions");
    expect(html).toContain("avery.sample@example.com");
    expect(html).toContain(">Approve<");
    expect(html).toContain(">Reject<");
    expect(html).toContain(">Download<");
    expect(html).toContain("/logo.png");
    expect(html).toContain("Instagram @avery.sample");
    expect(html).toContain("Film stock Kodak Portra 400");
    expect(html).not.toContain("storage_path");
    expect(html).not.toContain("Bea Knitter");

    const blankItem: PhotoReviewItem = {
      ...previewPhotoReviewItems()[0]!,
      instagramHandle: null,
      filmStock: null,
    };
    const blank = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <PhotoReview preview initialItems={[blankItem]} />
      </QueryClientProvider>,
    );
    expect(blank).toContain("Instagram —");
    expect(blank).toContain("Film stock —");
  });
});
