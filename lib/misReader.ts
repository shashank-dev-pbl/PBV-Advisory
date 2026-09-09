import ExcelJS from "exceljs";
import { PERIOD_FIGURES_FIELDS } from "@/lib/types";

// The MIS template format is frozen — see "03 — MIS Template v1.0.xlsx", the
// PBA-DATA sheet. Add a version here only when a genuinely new template is
// issued; an unknown version is refused, never guessed at.
const KNOWN_TEMPLATE_VERSIONS = ["1.0"];

const DATA_SHEET = "PBA-DATA";
const CHECKS_SHEET = "Checks";

export type MisReadResult =
  | { ok: true; templateVersion: string; figures: Record<(typeof PERIOD_FIGURES_FIELDS)[number], number> }
  | { ok: false; reason: "parse_error"; message: string }
  | { ok: false; reason: "unknown_template_version"; templateVersion: string }
  | { ok: false; reason: "checks_failed"; failedCheckName: string }
  | { ok: false; reason: "bad_value"; field: string; raw: unknown };

// Cells are read as the workbook's own cached formula results — never
// recalculated here. Trusting the workbook's own numbers, refusing anything
// that comes back as an error, is the whole point of "never by cell address,
// never guessed": we read exactly what the auditor's spreadsheet already
// computed and checked against itself.
function resolvedValue(cell: ExcelJS.Cell | undefined): unknown {
  if (!cell) return undefined;
  const v = cell.value;
  if (v && typeof v === "object" && "result" in v) return (v as { result: unknown }).result;
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

  return {
    ok: true,
    templateVersion,
    figures: figures as Record<(typeof PERIOD_FIGURES_FIELDS)[number], number>,
  };
}
