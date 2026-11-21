import { redirect } from "next/navigation";

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const next = token ? `/email/preferences?token=${encodeURIComponent(token)}` : "/email/preferences";
  redirect(next);
}
