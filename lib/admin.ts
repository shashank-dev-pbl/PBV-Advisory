export const ADMIN_EMAILS = ["shashank@primebottomline.vc"];

export function isAdminEmail(email: string | null | undefined) {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}
