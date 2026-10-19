import { redirect } from "next/navigation";

// Master is one place with three tabs; the old address lands on the first.
export default function MasterIndex() {
  redirect("/master/once");
}
