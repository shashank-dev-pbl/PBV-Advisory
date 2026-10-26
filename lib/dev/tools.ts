// Dev-only helpers are on only off production and only for a company whose name says it is a test company.
export const devToolsOn = (companyName: string) => process.env.VERCEL_ENV !== "production" && /\(test\)/i.test(companyName);
