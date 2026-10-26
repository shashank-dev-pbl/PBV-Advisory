// Legal (spec 09): who sees what, who may do what at each stage, and the money. Pure, so the same rules drive the screen, the server
// actions and the tests. The database enforces the same rules again (20261026_legal.sql): this is for showing the right buttons.
export const GST_RATE = 0.18;
export type LegalStatus = "quote" | "pay" | "progress" | "extra" | "done";
export type LegalWho = "founder" | "external" | "pba" | "admin";
export type LegalType = { id: string; kind: "draft" | "review"; name: string; price: number | null; quote_from: number | null; days: number | null; pages_covered: number | null; unit_note: string | null; what_it_is: string; when_needed: string; what_you_get: string };

export const withGst = (n: number) => n * (1 + GST_RATE);
export const gstOf = (n: number) => Math.round(n * GST_RATE * 100) / 100;
export const rup = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export const STATUS: Record<LegalStatus, { label: string; colour: string; bg: string; waitingOn: "pba" | "founder" | null }> = {
  quote: { label: "Waiting for our price", colour: "#8a6412", bg: "#fdf3dd", waitingOn: "pba" },
  pay: { label: "Waiting for your payment", colour: "#b3261e", bg: "#fbe9e7", waitingOn: "founder" },
  progress: { label: "In progress", colour: "#26527f", bg: "#e9eef5", waitingOn: "pba" },
  extra: { label: "Extra work to approve", colour: "#b3261e", bg: "#fbe9e7", waitingOn: "founder" },
  done: { label: "Delivered", colour: "#004d00", bg: "#e6efe3", waitingOn: null },
};
export const STEPS = ["Requested", "Priced", "Paid", "In progress", "Ready", "Delivered"];
export const stepOf = (s: LegalStatus) => ({ quote: 1, pay: 2, progress: 4, extra: 5, done: 6 })[s];

// External practitioners get the locked page for every Legal route and action.
export const canSee = (who: LegalWho) => who !== "external";
export const isStaff = (who: LegalWho) => who === "pba" || who === "admin";
export const canRequest = (who: LegalWho) => who === "founder" || isStaff(who);
export const canPay = (who: LegalWho) => who === "founder" || who === "admin";
export const canEditPrices = (who: LegalWho) => who === "admin";

// A fixed price applies only when the type has one and the file fits the pages it covers; otherwise it is quoted within a working day.
export function fixedPrice(t: LegalType, pages: number | null): number | null {
  if (t.price == null) return null;
  if (t.pages_covered != null && !(pages != null && pages >= 1 && pages <= t.pages_covered)) return null;
  return t.price;
}
// The price we suggest when a longer file is quoted: scaled by length, rounded to ₹500.
export const suggestQuote = (t: LegalType, pages: number | null) => (t.price && t.pages_covered && pages ? Math.round((t.price * Math.max(1, pages / t.pages_covered)) / 500) * 500 : t.price ?? t.quote_from ?? null);

export type Action = "price" | "pay" | "finish" | "deliver" | "propose_extra" | "approve_extra" | "note" | "download_finished";
export function can(who: LegalWho, status: LegalStatus, action: Action): boolean {
  if (!canSee(who)) return false;
  switch (action) {
    case "price": return isStaff(who) && status === "quote";
    case "pay": return canPay(who) && status === "pay";
    case "finish": return isStaff(who) && status === "progress";
    case "propose_extra": return isStaff(who) && status === "progress";
    case "deliver": return isStaff(who) && status === "progress";
    case "approve_extra": return canPay(who) && status === "extra";
    case "note": return status !== "done" || isStaff(who);
    case "download_finished": return status === "done" || isStaff(who);     // never while an extra is unpaid
  }
}
export const waitingOnMe = (who: LegalWho, status: LegalStatus) => (STATUS[status].waitingOn === "founder" && canPay(who) && who === "founder") || (STATUS[status].waitingOn === "pba" && isStaff(who) && (status === "quote"));
