// Builds public/mis-template-v1.1.xlsx from v1.0: a new "Tax and People" sheet for the accountant to fill, and the extra figures on
// PBA-DATA (with their pba_* names) linked to it. Everything in v1.0 is left exactly as it was.
import ExcelJS from "exceljs";

type Fld = { name: string; label: string; sample: number | string; hint: string; fmt?: string };
const FIELDS: Fld[] = [
  { name: "gst_output", label: "GST charged on sales (output tax)", sample: 127800, hint: "From the GST working: total output tax for the month, all GSTINs." },
  { name: "gst_itc", label: "GST credit used (input tax credit)", sample: 41000, hint: "Credit set off against the output tax in GSTR-3B." },
  { name: "gst_paid_cash", label: "GST paid in cash", sample: 86800, hint: "Output tax less credit: the GSTR-3B challan amount." },
  { name: "igst", label: "IGST (output)", sample: 76680, hint: "Output tax on sales to other states." },
  { name: "cgst", label: "CGST (output)", sample: 25560, hint: "Output tax on sales within the state, central half." },
  { name: "sgst", label: "SGST (output)", sample: 25560, hint: "Output tax on sales within the state, state half." },
  { name: "tds_salary", label: "TDS deposited — salaries", sample: 31000, hint: "Section 192, from the TDS challan." },
  { name: "tds_vendor", label: "TDS deposited — vendors and professionals", sample: 12400, hint: "Sections 194C, 194J and similar." },
  { name: "tds_rent", label: "TDS deposited — rent", sample: 4000, hint: "Section 194-I." },
  { name: "pt_paid", label: "Professional tax paid", sample: 0, hint: "From the professional tax challan. 0 if none was due this month." },
  { name: "interest_fees", label: "Interest and late fees paid", sample: 0, hint: "Anything paid only because a filing or payment was late. 0 if none." },
  { name: "employees", label: "Employees on payroll at month end", sample: 14, hint: "From the payroll register." },
  { name: "contractors", label: "Contractors paid in the month", sample: 5, hint: "From the contractor payments." },
  { name: "notices_open", label: "Open government notices", sample: 0, hint: "GST, income tax or ROC letters still needing a reply." },
  { name: "exp_salaries", label: "Expenses — salaries", sample: 450000, hint: "From the P&L. The eight heads must add up to total expenses." },
  { name: "exp_contractors", label: "Expenses — contractors", sample: 90000, hint: "" },
  { name: "exp_cloud", label: "Expenses — cloud and AI tools", sample: 72000, hint: "" },
  { name: "exp_marketing", label: "Expenses — marketing", sample: 48000, hint: "" },
  { name: "exp_rent", label: "Expenses — office rent", sample: 40000, hint: "" },
  { name: "exp_travel", label: "Expenses — travel", sample: 32000, hint: "" },
  { name: "exp_software", label: "Expenses — software", sample: 24000, hint: "" },
  { name: "exp_other", label: "Expenses — everything else", sample: 49000, hint: "" },
];
const NOTE = { name: "interest_note", label: "Reason for interest or late fees", sample: "", hint: "One line. Required if interest or late fees above are more than 0." };

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("public/mis-template-v1.0.xlsx");
  const sheet = wb.addWorksheet("Tax and People", { properties: { tabColor: { argb: "FFC98500" } } });
  sheet.columns = [{ width: 46 }, { width: 18 }, { width: 70 }];
  sheet.addRow(["Tax and People"]).font = { bold: true, size: 14 };
  sheet.addRow(["Fill the amber cells for the month, in rupees. These feed the taxes, team and expense sections of the dashboard."]);
  sheet.addRow([]);
  const head = sheet.addRow(["Figure", "Value", "Where it comes from"]); head.font = { bold: true };
  const row = new Map<string, number>();
  for (const f of [...FIELDS, NOTE]) {
    const r = sheet.addRow([f.label, f.sample, f.hint]);
    r.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDF3DD" } };
    r.getCell(2).numFmt = typeof f.sample === "number" ? "#,##0" : "@";
    row.set(f.name, r.number);
  }
  const tot = sheet.addRow(["Expense heads total (must equal total expenses)", { formula: `SUM(B${row.get("exp_salaries")}:B${row.get("exp_other")})`, result: FIELDS.filter((f) => f.name.startsWith("exp_")).reduce((s, f) => s + (f.sample as number), 0) }, ""]);
  tot.font = { italic: true }; tot.getCell(2).numFmt = "#,##0";

  const data = wb.getWorksheet("PBA-DATA")!;
  // Version, then the new figures below the 24, moving the footer down.
  data.getCell("B5").value = "1.1";
  const footer1 = data.getCell("A38").value, footer2 = data.getCell("A39").value;
  data.getCell("A38").value = null; data.getCell("A39").value = null;
  let r = 38;
  data.getCell(`A${r}`).value = "THE EXTRA FIGURES (template 1.1)"; data.getCell(`A${r}`).font = { bold: true }; r++;
  const model = wb.definedNames;
  for (const f of [...FIELDS, NOTE]) {
    data.getCell(`A${r}`).value = f.name;
    data.getCell(`B${r}`).value = { formula: `'Tax and People'!B${row.get(f.name)}`, result: f.sample } as ExcelJS.CellFormulaValue;
    model.add(`'PBA-DATA'!$B$${r}`, `pba_${f.name}`);
    r++;
  }
  r++;
  data.getCell(`A${r++}`).value = footer1; data.getCell(`A${r}`).value = footer2;
  await wb.xlsx.writeFile("public/mis-template-v1.1.xlsx");
  console.log("written public/mis-template-v1.1.xlsx with", FIELDS.length + 1, "extra figures");
})();
