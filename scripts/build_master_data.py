"""Builds the machine-readable master data from the three CSVs the business edits:
  data/master/04-master-rules.csv, 05-filing-calendar.csv, 07-document-explainers.csv
The CSVs hold the wording and the rules; this script adds only the machine fields (condition key, what a rule repeats
per, which months it appears in, where it lands) and writes data/master/*.json plus the SQL seed. Run: python3 scripts/build_master_data.py
"""
import csv, json, re, os

def rows(p): return list(csv.DictReader(open(p, encoding="utf-8-sig")))

# rule_id -> (cond, repeat, schedule, section, owner, doc_type)
#   cond      a key from the vocabulary in lib/master/engine.ts (conditions)
#   repeat    what the rule repeats per: bank | gstin | state | gateway | loan | issue | round | holding | None
#   schedule  once | monthly | quarter_end | march | event | meta
#   section   standard | event | from_company | books | filings | delivered | meta
#   owner     founder | books | pba | document
R = {
 "R01": ("entity.company", None, "once", "standard", "founder", "coi"),
 "R02": ("entity.company", None, "once", "standard", "founder", "moa"),
 "R03": ("entity.llp", None, "once", "standard", "founder", "coi"),
 "R04": ("entity.llp", None, "once", "standard", "founder", "generic"),
 "R05": ("entity.partnership", None, "once", "standard", "founder", "generic"),
 "R06": ("always", None, "once", "standard", "founder", "pan"),
 "R07": ("tan.given", None, "once", "standard", "founder", "tan"),
 "R08": ("older.thisFy", None, "once", "standard", "books", "afs"),
 "R09": ("catchup", None, "meta", "meta", "document", "generic"),
 "R10": ("entity.company", None, "event", "event", "founder", "generic"),
 "R11": ("always", None, "once", "standard", "books", "otb"),
 "R12": ("always", None, "monthly", "books", "books", "tb"),
 "R13": ("always", None, "monthly", "books", "books", "pl"),
 "R14": ("always", None, "monthly", "books", "books", "bs"),
 "R15": ("books.firmOrTeam", None, "monthly", "books", "books", "mis"),
 "R16": ("always", "bank", "monthly", "from_company", "founder", "bank"),
 "R17": ("always", "gstin", "once", "standard", "founder", "gstc"),
 "R18": ("always", "gstin", "monthly", "from_company", "founder", "sales"),
 "R19": ("gstin.notComposition", "gstin", "monthly", "books", "books", "pur"),
 "R20": ("gstin.regular", "gstin", "monthly", "books", "books", "gstw"),
 "R21": ("gstin.quarterly", "gstin", "quarter_end", "books", "books", "gstw"),
 "R22": ("always", "gstin", "meta", "meta", "books", "generic"),
 "R23": ("salaries.pays", None, "once", "standard", "founder", "head"),
 "R24": ("salaries.pays", None, "monthly", "from_company", "founder", "pay"),
 "R25": ("pf.yes", None, "meta", "meta", "books", "pf"),
 "R26": ("esi.yes", None, "meta", "meta", "books", "pf"),
 "R27": ("pt.any", "state", "meta", "meta", "books", "pt"),
 "R28": ("founders.paid", None, "quarter_end", "from_company", "founder", "fr"),
 "R29": ("contractors.some", None, "monthly", "from_company", "founder", "contr"),
 "R30": ("tds.any", None, "meta", "meta", "books", "tdsp"),
 "R31": ("tds.any", None, "quarter_end", "books", "books", "generic"),
 "R32": ("tds.salaries", None, "meta", "meta", "books", "tdsr"),
 "R33": ("tds.vendorsOrRent", None, "meta", "meta", "books", "tdsr"),
 "R34": ("tds.nonresident", None, "meta", "meta", "books", "tdsr"),
 "R35": ("always", None, "once", "standard", "founder", "cl"),
 "R36": ("always", None, "monthly", "from_company", "founder", "coll"),
 "R37": ("always", None, "monthly", "books", "books", "debt"),
 "R38": ("partners.yes", None, "once", "standard", "founder", "rsa"),
 "R39": ("partners.yes", None, "monthly", "from_company", "founder", "partner"),
 "R40": ("gateway.some", "gateway", "monthly", "from_company", "founder", "gw"),
 "R41": ("advances.yes", None, "monthly", "from_company", "founder", "adv"),
 "R42": ("exports.yes", None, "monthly", "from_company", "founder", "generic"),
 "R43": ("loan.some", "loan", "event", "event", "founder", "generic"),
 "R44": ("loan.some", "loan", "meta", "meta", "document", "generic"),
 "R47": ("loan.some", "loan", "monthly", "from_company", "founder", "generic"),
 "R48": ("issue.some", "issue", "event", "event", "document", "generic"),
 "R49": ("issue.redeemed", "issue", "event", "event", "document", "generic"),
 "R50": ("issue.outstanding", "issue", "quarter_end", "from_company", "founder", "generic"),
 "R51": ("round.some", "round", "event", "event", "document", "generic"),
 "R52": ("round.foreign", "round", "meta", "meta", "document", "generic"),
 "R53": ("round.grant", "round", "event", "event", "founder", "generic"),
 "R54": ("round.some", None, "once", "standard", "founder", "cap"),
 "R55": ("round.some", None, "meta", "delivered", "pba", "generic"),
 "R56": ("holding.fdOrFund", "holding", "monthly", "from_company", "founder", "hold"),
 "R57": ("holding.other", "holding", "march", "from_company", "founder", "hold"),
}
rules = []
for i, r in enumerate(rows("data/master/04-master-rules.csv")):
    cond, repeat, sched, section, owner, doc_type = R[r["rule_id"]]
    rules.append({
        "rule_id": r["rule_id"], "step": r["step"], "when_text": r["when"], "request": r["request"], "frequency": r["frequency"],
        "tier": r["tier"], "default_owner": r["default_owner"], "lands_in": r["lands_in"], "repeats_per": r["repeats_per"], "notes": r["notes"],
        "cond": cond, "repeat_by": repeat, "schedule": sched, "section": section, "owner_key": owner, "doc_type": doc_type, "sort": i, "active": True,
    })

CAT1 = ["Andaman and Nicobar Islands","Chhattisgarh","Dadra and Nagar Haveli and Daman and Diu","Goa","Gujarat","Karnataka","Kerala","Lakshadweep","Madhya Pradesh","Maharashtra","Puducherry","Tamil Nadu","Telangana","Andhra Pradesh"]
Q = {"1": "07-31", "2": "10-31", "3": "01-31", "4": "05-31"}
# filing_id -> (cond, repeat, schedule, due, ticks, doc_type)
F = {
 "F01": ("gstin.regular", "gstin", "monthly", {"kind": "day_next_month", "day": 11}, ["filed"], "g1"),
 "F02": ("gstin.regular", "gstin", "monthly", {"kind": "day_next_month", "day": 20}, ["paid", "filed"], "g3"),
 "F03": ("gstin.qrmp", "gstin", "quarter_months_1_2", {"kind": "day_next_month", "day": 25}, ["paid"], "gpay"),
 "F04": ("gstin.qrmp", "gstin", "quarter_end", {"kind": "day_after_quarter", "day": 13}, ["filed"], "g1"),
 "F05": ("gstin.qrmp", "gstin", "quarter_end", {"kind": "day_after_quarter", "day": 22, "alt_day": 24, "early_states": CAT1}, ["paid", "filed"], "g3"),
 "F06": ("gstin.composition", "gstin", "quarter_end", {"kind": "day_after_quarter", "day": 18}, ["paid", "filed"], "gpay"),
 "F07": ("tds.any", None, "monthly", {"kind": "day_next_month", "day": 7, "overrides": {"03": "04-30"}}, ["paid"], "tdsp"),
 "F08": ("tds.salaries", None, "quarter_end", {"kind": "quarter_fixed", "by_quarter": Q}, ["filed"], "tdsr"),
 "F09": ("tds.vendorsOrRent", None, "quarter_end", {"kind": "quarter_fixed", "by_quarter": Q}, ["filed"], "tdsr"),
 "F10": ("tds.nonresident", None, "quarter_end", {"kind": "quarter_fixed", "by_quarter": Q}, ["filed"], "tdsr"),
 "F11": ("pf.yes", None, "monthly", {"kind": "day_next_month", "day": 15}, ["paid", "filed"], "pf"),
 "F12": ("esi.yes", None, "monthly", {"kind": "day_next_month", "day": 15}, ["paid"], "pf"),
 "F13": ("pt.monthlyState", "state", "monthly", {"kind": "day_next_month", "day": 20}, ["paid"], "pt"),
 "F14": ("pt.halfYearlyState", "state", "half_yearly", {"kind": "half_year", "h1": "09-30", "h2": "03-31"}, ["paid"], "pt"),
}
filings = []
for i, r in enumerate(rows("data/master/05-filing-calendar.csv")):
    cond, repeat, sched, due, ticks, doc_type = F[r["filing_id"]]
    filings.append({
        "filing_id": r["filing_id"], "filing": r["filing"], "switched_on_by": r["switched_on_by"], "frequency": r["frequency"],
        "belongs_to": r["belongs_to"], "due_text": r["due_rule"], "ticks_needed": r["ticks_needed"], "proof_for_each_tick": r["proof_for_each_tick"], "notes": r["notes"],
        "cond": cond, "repeat_by": repeat, "schedule": sched, "due_rule": due, "ticks": ticks, "doc_type": doc_type, "sort": i, "active": True,
    })

def fields(s):
    out = []
    for part in [p.strip() for p in (s or "").split(";") if p.strip()]:
        m = re.match(r"^(.*)\((amount|number|text|date|percent)\)$", part)
        out.append({"label": m.group(1).strip(), "type": m.group(2)} if m else {"label": part, "type": "text"})
    return out
explainers = []
for r in rows("data/master/07-document-explainers.csv"):
    explainers.append({
        "doc_type": r["doc_type"], "name": r["name"], "what_it_is": r["what_it_is"], "why_it_matters": r["why_it_matters"],
        "summary_fields": fields(r["summary_fields_typed_by_uploader"]), "where_from": r["where_it_comes_from"],
        "what_pba_checks": r["what_pba_checks"], "if_late": r["if_late"],
    })
for name, data in (("rules", rules), ("filings", filings), ("explainers", explainers)):
    json.dump(data, open(f"data/master/{name}.json", "w"), indent=1, ensure_ascii=False)
print(len(rules), "rules,", len(filings), "filings,", len(explainers), "explainers")

def q(v):
    if v is None: return "null"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, (dict, list)): return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"
def insert(table, cols, data, key):
    def cell(d, c):
        if c == "ticks": return "array[" + ", ".join(q(t) for t in d[c]) + "]::text[]"
        return q(d[c])
    vals = ",\n ".join("(" + ", ".join(cell(d, c) for c in cols) + ")" for d in data)
    return f"insert into {table} ({', '.join(cols)}) values\n {vals}\non conflict ({key}) do nothing;\n"
sql = """-- Build 5: the master's rules, the filing calendar and the side-panel text, as editable data.
-- Seeded from the three CSVs the business keeps (04, 05, 07). Editing a row changes behaviour; no release needed.
-- Generated by scripts/build_master_data.py. Run in the Supabase SQL editor.

create table if not exists master_rule (
  rule_id text primary key, step text not null, when_text text, request text not null, frequency text, tier text,
  default_owner text, lands_in text, repeats_per text, notes text,
  cond text not null, repeat_by text, schedule text not null, section text not null, owner_key text not null, doc_type text,
  sort int not null default 0, active boolean not null default true
);
create table if not exists master_filing (
  filing_id text primary key, filing text not null, switched_on_by text, frequency text, belongs_to text, due_text text,
  ticks_needed text, proof_for_each_tick text, notes text,
  cond text not null, repeat_by text, schedule text not null, due_rule jsonb not null, ticks text[] not null, doc_type text,
  sort int not null default 0, active boolean not null default true
);
create table if not exists doc_explainer (
  doc_type text primary key, name text not null, what_it_is text, why_it_matters text, summary_fields jsonb not null default '[]'::jsonb,
  where_from text, what_pba_checks text, if_late text
);
alter table master_rule enable row level security;
alter table master_filing enable row level security;
alter table doc_explainer enable row level security;
create policy "read master_rule" on master_rule for select to authenticated using (true);
create policy "read master_filing" on master_filing for select to authenticated using (true);
create policy "read doc_explainer" on doc_explainer for select to authenticated using (true);
create policy "admin writes master_rule" on master_rule for all to authenticated using (is_platform_admin()) with check (is_platform_admin());
create policy "admin writes master_filing" on master_filing for all to authenticated using (is_platform_admin()) with check (is_platform_admin());
create policy "admin writes doc_explainer" on doc_explainer for all to authenticated using (is_platform_admin()) with check (is_platform_admin());

"""
sql += insert("master_rule", ["rule_id","step","when_text","request","frequency","tier","default_owner","lands_in","repeats_per","notes","cond","repeat_by","schedule","section","owner_key","doc_type","sort","active"], rules, "rule_id")
sql += "\n" + insert("master_filing", ["filing_id","filing","switched_on_by","frequency","belongs_to","due_text","ticks_needed","proof_for_each_tick","notes","cond","repeat_by","schedule","due_rule","ticks","doc_type","sort","active"], filings, "filing_id").replace("'[", "'[").replace("ticks, doc_type","ticks, doc_type")
sql += "\n" + insert("doc_explainer", ["doc_type","name","what_it_is","why_it_matters","summary_fields","where_from","what_pba_checks","if_late"], explainers, "doc_type")
open("supabase/migrations/20261021_master_data.sql", "w", encoding="utf-8").write(sql)
print("wrote supabase/migrations/20261021_master_data.sql")
