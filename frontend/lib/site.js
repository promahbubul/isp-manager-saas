/**
 * Business details used on public/legal pages, the footer and the app chrome.
 * Env variables (NEXT_PUBLIC_*) override these defaults, e.g. on a staging deploy.
 */
export const site = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "ISP ERP",
  legalName: process.env.NEXT_PUBLIC_LEGAL_NAME || "Beauty Software Ltd.",
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "mahbublalam500@gmail.com",
  phone: process.env.NEXT_PUBLIC_SUPPORT_PHONE || "01623361555",
  address: process.env.NEXT_PUBLIC_OFFICE_ADDRESS || "House #06, Avenue #03, Road #L-14, Block #C, Section #11, Pallabi, Dhaka",
  tradeLicense: process.env.NEXT_PUBLIC_TRADE_LICENSE || "",
};
