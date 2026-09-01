export const ADMIN_EMAILS = ["rshashank@arre.co.in"];

export function isAdminEmail(email: string | null | undefined) {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}
