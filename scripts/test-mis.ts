import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { parseMisWorkbook } from "../lib/misReader";

(async () => {
  const v10 = await parseMisWorkbook(readFileSync("public/mis-template-v1.0.xlsx"));
  assert.ok(v10.ok && v10.templateVersion === "1.0" && Object.keys(v10.extras).length === 0, "v1.0 still reads, with no extras");
  const v11 = await parseMisWorkbook(readFileSync("public/mis-template-v1.1.xlsx"));
  assert.ok(v11.ok && v11.templateVersion === "1.1");
  if (v11.ok) { assert.equal(v11.extras.pt_paid, 0, "a real zero is read as zero, not refused"); assert.equal(v11.extras.employees, 14); assert.equal(v11.extras.exp_salaries, 450000); }

  const change = async (edit: (d: ExcelJS.Worksheet) => void) => {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile("public/mis-template-v1.1.xlsx"); edit(wb.getWorksheet("PBA-DATA")!);
    return parseMisWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
  };
  const row = (d: ExcelJS.Worksheet, name: string) => { for (let r = 1; r <= d.rowCount; r++) if (d.getCell(r, 1).value === name) return d.getCell(r, 2); throw new Error(name); };
  const bad = await change((d) => { const c = row(d, "exp_other"); c.value = { formula: "0", result: 54000 }; });
  assert.ok(!bad.ok && bad.reason === "checks_failed" && /expense heads/i.test(bad.failedCheckName), "heads that do not add to total expenses are refused");
  const fee = await change((d) => { row(d, "interest_fees").value = { formula: "0", result: 1840 }; });
  assert.ok(!fee.ok && fee.reason === "checks_failed" && /reason/i.test(fee.failedCheckName), "late fees without a reason are refused");
  const ver = await change((d) => { d.getCell("B5").value = "9.9"; });
  assert.ok(!ver.ok && ver.reason === "unknown_template_version");
  const neg = await change((d) => { row(d, "employees").value = { formula: "0", result: -3 }; });
  assert.ok(!neg.ok && neg.reason === "bad_value", "negative headcount refused");
  console.log("ok - MIS workbook reader");
})();
