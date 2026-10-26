import ExcelJS from "exceljs";
import JSZip from "jszip";
import { PERIOD_FIGURES_FIELDS, PERIOD_FIGURES_V11_FIELDS } from "@/lib/types";

// The MIS template format is frozen — see "03 — MIS Template v1.0.xlsx", the
// PBA-DATA sheet. Add a version here only when a genuinely new template is
// issued; an unknown version is refused, never guessed at.
const KNOWN_TEMPLATE_VERSIONS = ["1.0", "1.1"];

const DATA_SHEET = "PBA-DATA";
const CHECKS_SHEET = "Checks";

export type MisReadResult =
  | { ok: true; templateVersion: string; figures: Record<(typeof PERIOD_FIGURES_FIELDS)[number], number>; extras: Partial<Record<(typeof PERIOD_FIGURES_V11_FIELDS)[number], number>> & { interest_note?: string } }
  | { ok: false; reason: "parse_error"; message: string }
  | { ok: false; reason: "unknown_template_version"; templateVersion: string }
  | { ok: false; reason: "checks_failed"; failedCheckName: string }
  | { ok: false; reason: "bad_value"; field: string; raw: unknown };

// Cells are read as the workbook's own cached formula results — never
// recalculated here. Trusting the workbook's own numbers, refusing anything
// that comes back as an error, is the whole point of "never by cell address,
// never guessed": we read exactly what the auditor's spreadsheet already
// computed and checked against itself.
// exceljs drops a cached formula result of exactly 0 when it reads a file, so a real zero (no clients lost, no partner share) looks like a missing value.
// Excel does store it as <v>0</v>; read those straight from the file so a genuine 0 is a 0, and a formula that was never calculated is still refused.
async function zeroFormulaCells(buffer: Buffer): Promise<Set<string>> {
  const zeros = new Set<string>();
  try {
    const zip = await JSZip.loadAsync(buffer);
    const wbXml = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
    const rels = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";
    const target = new Map<string, string>();
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) { const id = /Id="([^"]+)"/.exec(m[0])?.[1], t = /Target="([^"]+)"/.exec(m[0])?.[1]; if (id && t) target.set(id, t.replace(/^\/?(xl\/)?/, "")); }
    for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
      const name = /name="([^"]+)"/.exec(m[0])?.[1], rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
      const file = rid ? target.get(rid) : undefined; if (!name || !file) continue;
      const xml = (await zip.file(`xl/${file}`)?.async("string")) ?? "";
      const decoded = name.replace(/&amp;/g, "&").replace(/&apos;/g, "'");
      for (const c of xml.matchAll(/<c r="([A-Z]+\d+)"[^>]*>\s*<f\b[^>]*>[^<]*<\/f>\s*<v>0(?:\.0+)?<\/v>/g)) zeros.add(`${decoded}!${c[1]}`);
      for (const c of xml.matchAll(/<c r="([A-Z]+\d+)"[^>]*>\s*<f\b[^>]*\/>\s*<v>0(?:\.0+)?<\/v>/g)) zeros.add(`${decoded}!${c[1]}`);
    }
  } catch { /* fall back to what exceljs gave us */ }
  return zeros;
}
let ZERO_CELLS = new Set<string>();

function resolvedValue(cell: ExcelJS.Cell | undefined): unknown {
  if (!cell) return undefined;
  const v = cell.value;
  if (v && typeof v === "object" && "result" in v) return (v as { result: unknown }).result;
  if (v && typeof v === "object" && "formula" in v && ZERO_CELLS.has(`${cell.worksheet.name}!${cell.address}`)) return 0;
  return v;
}

function findLabeledValue(sheet: ExcelJS.Worksheet, label: string): unknown {
  for (let row = 1; row <= sheet.rowCount; row++) {
    const a = resolvedValue(sheet.getCell(row, 1));
    if (typeof a === "string" && a.trim() === label) {
      return resolvedValue(sheet.getCell(row, 2));
    }
  }
  return undefined;
}

export async function parseMisWorkbook(buffer: Buffer): Promise<MisReadResult> {
  let workbook: ExcelJS.Workbook;
  try {
    workbook = new ExcelJS.Workbook();
    // exceljs's bundled types predate @types/node's generic Buffer<T> — functionally identical at runtime.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (err) {
    return { ok: false, reason: "parse_error", message: err instanceof Error ? err.message : "Could not open the file" };
  }

  ZERO_CELLS = await zeroFormulaCells(buffer);
  const dataSheet = workbook.getWorksheet(DATA_SHEET);
  if (!dataSheet) {
    return { ok: false, reason: "parse_error", message: `Sheet "${DATA_SHEET}" not found — this doesn't look like the agreed template.` };
  }

  const templateVersion = findLabeledValue(dataSheet, "template_version");
  if (typeof templateVersion !== "string" || !KNOWN_TEMPLATE_VERSIONS.includes(templateVersion)) {
    return { ok: false, reason: "unknown_template_version", templateVersion: String(templateVersion ?? "unknown") };
  }

  const checksAllPass = findLabeledValue(dataSheet, "checks_all_pass");
  if (checksAllPass !== "PASS") {
    const checksSheet = workbook.getWorksheet(CHECKS_SHEET);
    let failedCheckName = "one of the workbook's checks";
    if (checksSheet) {
      for (let row = 1; row <= checksSheet.rowCount; row++) {
        const name = resolvedValue(checksSheet.getCell(row, 1));
        const result = resolvedValue(checksSheet.getCell(row, 4));
        if (typeof name === "string" && result === "FAIL") {
          failedCheckName = name;
          break;
        }
      }
    }
    return { ok: false, reason: "checks_failed", failedCheckName };
  }

  const figures: Record<string, number> = {};
  const definedNames = workbook.definedNames.model;
  const rangeByName = new Map<string, string>();
  for (const entry of definedNames) {
    if (entry.ranges[0]) rangeByName.set(entry.name, entry.ranges[0]);
  }

  for (const field of PERIOD_FIGURES_FIELDS) {
    const definedName = `pba_${field}`;
    const range = rangeByName.get(definedName);
    if (!range) {
      return { ok: false, reason: "parse_error", message: `Named range "${definedName}" is missing — the workbook's structure has changed.` };
    }
    const match = range.match(/^'?([^'!]+)'?!\$?([A-Z]+)\$?(\d+)$/);
    if (!match) {
      return { ok: false, reason: "parse_error", message: `Could not read the location of "${definedName}".` };
    }
    const [, sheetName, col, rowStr] = match;
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) {
      return { ok: false, reason: "parse_error", message: `Sheet "${sheetName}" referenced by "${definedName}" is missing.` };
    }
    const raw = resolvedValue(sheet.getCell(`${col}${rowStr}`));
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      return { ok: false, reason: "bad_value", field, raw };
    }
    figures[field] = raw;
  }

  // Version 1.1 also carries tax, headcount and expense-head figures. They are read the same way, and the heads must add up to the
  // month's expenses — a split that does not is refused rather than shown.
  const extras: Partial<Record<(typeof PERIOD_FIGURES_V11_FIELDS)[number], number>> & { interest_note?: string } = {};
  if (templateVersion === "1.1") {
    const read = (name: string): unknown => {
      const range = rangeByName.get(name); const m = range?.match(/^'?([^'!]+)'?!\$?([A-Z]+)\$?(\d+)$/);
      const sheet = m ? workbook.getWorksheet(m[1]) : undefined;
      return m && sheet ? resolvedValue(sheet.getCell(`${m[2]}${m[3]}`)) : undefined;
    };
    for (const field of PERIOD_FIGURES_V11_FIELDS) {
      const raw = read(`pba_${field}`);
      if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return { ok: false, reason: "bad_value", field, raw };
      extras[field] = raw;
    }
    const note = read("pba_interest_note");
    if (typeof note === "string" && note.trim()) extras.interest_note = note.trim().slice(0, 200);
    const heads = (["exp_salaries", "exp_contractors", "exp_cloud", "exp_marketing", "exp_rent", "exp_travel", "exp_software", "exp_other"] as const).reduce((s, k) => s + (extras[k] ?? 0), 0);
    if (Math.abs(heads - figures.expenses_accrual) > 1) return { ok: false, reason: "checks_failed", failedCheckName: "The expense heads add up to total expenses" };
    if ((extras.interest_fees ?? 0) > 0 && !extras.interest_note) return { ok: false, reason: "checks_failed", failedCheckName: "Interest or late fees need a one-line reason" };
  }

  return {
    ok: true,
    templateVersion,
    figures: figures as Record<(typeof PERIOD_FIGURES_FIELDS)[number], number>,
    extras,
  };
}
