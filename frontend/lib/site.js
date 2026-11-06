/** Business details used on public/legal pages. Set them in .env.local before going live. */
export const site = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "ISP Manager",
  legalName: process.env.NEXT_PUBLIC_LEGAL_NAME || "[Your Company Ltd.]",
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@example.com",
  phone: process.env.NEXT_PUBLIC_SUPPORT_PHONE || "+880 1XXX-XXXXXX",
  address: process.env.NEXT_PUBLIC_OFFICE_ADDRESS || "[Office address, Dhaka, Bangladesh]",
  tradeLicense: process.env.NEXT_PUBLIC_TRADE_LICENSE || "[Trade licence no.]",
};
