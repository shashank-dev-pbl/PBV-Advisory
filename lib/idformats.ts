// Government identifiers, checked against the rules that issue them. Nothing that does not fit is accepted, and the parts that
// repeat across IDs (the PAN inside a GSTIN, the year inside a CIN) must agree with each other.
import type { Answers } from "@/lib/master/types";

export type IdFormat = "pan" | "tan" | "cin" | "llpin" | "gstin" | "last4" | "count";

const GST_STATE: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi",
  "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
  "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh",
  "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa",
  "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands", "36": "Telangana",
  "37": "Andhra Pradesh", "38": "Ladakh",
};
const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// The 15th character of a GSTIN is a check digit over the first 14.
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) { const p = ALNUM.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2); sum += Math.floor(p / 36) + (p % 36); }
  return ALNUM[(36 - (sum % 36)) % 36];
}

export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const PAN_HOLDER = "ABCFGHJLPTK";            // 4th letter: Association, Body, Company, Firm, Govt, HUF, Juridical, LLP, Person, Trust, Krishi
export const TAN_RE = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
const CIN_RE = /^([LU])(\d{5})([A-Z]{2})(\d{4})([A-Z]{3})(\d{6})$/;
const LLPIN_RE = /^[A-Z]{3}-\d{4}$/;

export const clean = (fmt: IdFormat, v: string) =>
  fmt === "last4" || fmt === "count" ? v.replace(/\D/g, "") : fmt === "llpin" ? v.toUpperCase().replace(/\s/g, "") : v.toUpperCase().replace(/[\s-]/g, "");
export const maxLen: Record<IdFormat, number> = { pan: 10, tan: 10, cin: 21, llpin: 8, gstin: 15, last4: 4, count: 6 };

// Returns what is wrong, in words the person can act on, or null when it is fine. Blank is not an error here: required-ness is separate.
export function checkId(fmt: IdFormat, raw: string | undefined, a: Answers, row?: Record<string, unknown>): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  switch (fmt) {
    case "pan": {
      if (!PAN_RE.test(v)) return "A PAN is 10 characters: five letters, four digits, one letter (like ABCDE1234F).";
      if (a.entity && a.entity !== "partnership" && a.entity !== "llp" && v[3] !== "C" && a.entity !== "section8") return "The fourth letter of a company's PAN is C.";
      if (a.entity === "llp" && v[3] !== "F") return "The fourth letter of an LLP's PAN is F.";
      if (a.entity === "partnership" && v[3] !== "F") return "The fourth letter of a firm's PAN is F.";
      if (!PAN_HOLDER.includes(v[3])) return "That fourth letter is not a valid PAN holder type.";
      return null;
    }
    case "tan": return TAN_RE.test(v) ? null : "A TAN is 10 characters: four letters, five digits, one letter (like BLRX12345A).";
    case "cin": {
      const m = CIN_RE.exec(v);
      if (!m) return "A CIN is 21 characters: L or U, five digits, two letters, four digits, three letters, six digits (like U72900KA2023PTC123456).";
      const year = +m[4], now = new Date().getFullYear();
      if (year < 1900 || year > now) return `The year in the CIN (${year}) is not a possible incorporation year.`;
      if (a.incorporatedOn && +a.incorporatedOn.slice(0, 4) !== year) return `The CIN says ${year} but the incorporation date is in ${a.incorporatedOn.slice(0, 4)}.`;
      if (a.details?.state) { const st: Record<string, string> = { KA: "Karnataka", MH: "Maharashtra", DL: "Delhi", TN: "Tamil Nadu", TG: "Telangana", AP: "Andhra Pradesh", KL: "Kerala", GJ: "Gujarat", HR: "Haryana", UP: "Uttar Pradesh", WB: "West Bengal", RJ: "Rajasthan", PB: "Punjab", MP: "Madhya Pradesh", CH: "Chandigarh", GA: "Goa", OR: "Odisha", BR: "Bihar", JH: "Jharkhand", CT: "Chhattisgarh", UR: "Uttarakhand", HP: "Himachal Pradesh", AS: "Assam", JK: "Jammu and Kashmir", PY: "Puducherry" }; if (st[m[3]] && st[m[3]] !== a.details.state) return `The CIN says the registered office is in ${st[m[3]]}, not ${a.details.state}.`; }
      return null;
    }
    case "llpin": return LLPIN_RE.test(v) ? null : "An LLPIN is three letters, a dash and four digits (like AAB-1234).";
    case "gstin": {
      if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v)) return "A GSTIN is 15 characters: state code, the PAN, an entity number, Z, and a check character (like 29ABCDE1234F1Z5).";
      if (!GST_STATE[v.slice(0, 2)]) return `${v.slice(0, 2)} is not a GST state code.`;
      if (gstinCheckChar(v.slice(0, 14)) !== v[14]) return "The last character does not match the rest of the GSTIN — check for a typing mistake.";
      if (a.details?.pan && PAN_RE.test(a.details.pan) && v.slice(2, 12) !== a.details.pan) return "The PAN inside this GSTIN is not the company's PAN.";
      const st = row?.state as string | undefined;
      if (st && GST_STATE[v.slice(0, 2)] !== st) return `This GSTIN is for ${GST_STATE[v.slice(0, 2)]}, but the state chosen is ${st}.`;
      return null;
    }
    case "last4": return /^\d{4}$/.test(v) ? null : "Enter exactly the last four digits of the account number.";
    case "count": return /^\d{1,6}$/.test(v) ? null : "Enter a whole number.";
  }
}
export const stateOfGstin = (g: string) => GST_STATE[g.slice(0, 2)];
