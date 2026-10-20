// One date format for everything a person reads: "7 Dec 2026", never "12/7/2026". Always Indian English.
const DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true };
type D = string | number | Date;
// A bare "YYYY-MM-DD" is a calendar date: read it as that day, not as midnight UTC shifted by a timezone.
const toDate = (d: D) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00`) : new Date(d));
export const fmtDate = (d: D) => toDate(d).toLocaleDateString("en-IN", DATE);
export const fmtDateShort = (d: D) => toDate(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
export const fmtDateTime = (d: D) => `${fmtDate(d)}, ${toDate(d).toLocaleTimeString("en-IN", TIME)}`;
