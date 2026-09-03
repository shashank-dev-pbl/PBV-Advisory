import { getCurrentAppUser } from "@/lib/auth";

export default async function DebugPage() {
  const appUser = await getCurrentAppUser();
  return (
    <pre>{JSON.stringify({ appUser }, null, 2)}</pre>
  );
}
