import { getCachedPublicMilesSaved } from "@/lib/miles-saved-data";
import MilesSavedCard from "@/components/MilesSavedCard";
import type { PublicMilesSaved } from "@/lib/miles-saved";

export default async function MilesSavedSection() {
  let stats: PublicMilesSaved | null = null;
  try {
    stats = await getCachedPublicMilesSaved();
  } catch {
    console.error("Miles saved figure unavailable");
    return null;
  }
  return <MilesSavedCard miles={stats.miles} laps={stats.laps} year={stats.year} />;
}
