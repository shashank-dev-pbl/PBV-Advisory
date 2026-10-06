import { pageGate } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import PageHeader from "../PageHeader";
import Locked from "../Locked";
import NoCompany from "../NoCompany";
import SettingUp from "../SettingUp";
import DataRoom from "./DataRoom";
import type { EventDocRow, EventRow, EventType, EventTypeDoc, LibDoc, StdDocRow, StdKind } from "@/lib/dataroom";

export default async function DataRoomPage() {
  const { session, locked } = await pageGate("dataroom");
  if (locked) return <Locked page="dataroom" who={session.who!} />;
  const company = session.company;
  if (!company) return <NoCompany page="dataroom" admin={session.who === "admin"} />;
  if (company.status === "setting_up") return <SettingUp page="dataroom" name={company.name} />;

  const supabase = await createClient();
  const [lib, types, typeDocs, kinds, std, events, docs] = await Promise.all([
    supabase.from("doc_library").select("code,name,form").order("sort"),
    supabase.from("event_type").select("code,name,category").order("sort"),
    supabase.from("event_type_doc").select("event_type,doc_code,need,condition_note").order("sort"),
    supabase.from("standard_kind").select("code,label,grp,sort,doc_codes").order("sort"),
    supabase.from("standard_document").select("id,kind,version,storage_path,filename,source,by_name,at").eq("company_id", company.id),
    supabase.from("event").select("id,type,event_date,title,description,amount,created_by_name").eq("company_id", company.id),
    supabase.from("event_document").select("id,event_id,doc_code,other_name,status,na_reason,storage_path,filename,by_name,at").eq("company_id", company.id),
  ]);

  return (
    <>
      <PageHeader title={company.name} accent="Data room" sub="The company's legal history in one place" />
      <div className="mx-auto w-full max-w-[1280px] px-5 py-8 md:px-8">
        <DataRoom
          companyId={company.id}
          canEdit={session.who !== "founder"}
          lib={(lib.data ?? []) as LibDoc[]}
          eventTypes={(types.data ?? []) as EventType[]}
          typeDocs={(typeDocs.data ?? []) as EventTypeDoc[]}
          kinds={(kinds.data ?? []) as StdKind[]}
          stdDocs={(std.data ?? []) as StdDocRow[]}
          events={(events.data ?? []) as EventRow[]}
          eventDocs={(docs.data ?? []) as EventDocRow[]}
        />
      </div>
    </>
  );
}
