import PhotoReview from "@/components/photos/PhotoReview";
import { isPhotoReviewPreview, PHOTO_REVIEW_PATH, previewPhotoReviewItems } from "@/lib/photo-submissions";

export const dynamic = "force-dynamic";

export default async function PhotoSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const params = await searchParams;
  const preview = isPhotoReviewPreview(PHOTO_REVIEW_PATH, params.preview ?? null);
  return <PhotoReview preview={preview} initialItems={preview ? previewPhotoReviewItems() : null} />;
}
