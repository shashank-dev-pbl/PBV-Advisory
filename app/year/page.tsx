import { redirect } from "next/navigation";

// Old address from before the shared menu — kept so existing links still land somewhere sensible.
export default function Page() {
  redirect("/filings");
}
