// Normalizes to the digits-only format Supabase Auth stores/returns for phone
// (no leading "+"), so app_user.phone always compares equal to auth.jwt()->>'phone'.
// Defaults a bare 10-digit number to India's country code, since every
// registered user today is in India — a real multi-country rollout would need
// an explicit country selector instead of this default.
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return `+${digits}`;
}

// A 10-digit mobile as typed: "9148379624" -> "91483 79624", so it reads the same as the placeholder.
export function formatMobileInput(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 10);
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
}
