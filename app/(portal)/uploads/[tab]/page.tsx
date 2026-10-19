import { redirect } from "next/navigation";

// Uploads is now Master. Old links and bookmarks land on the matching tab.
export default async function OldUploads({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  redirect(`/master/${tab}`);
}
