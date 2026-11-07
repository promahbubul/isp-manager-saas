import PwaRegister from "@/components/portal/PwaRegister";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return {
    title: "My account",
    manifest: `/portal/${slug}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: "My account", statusBarStyle: "default" },
    icons: { apple: "/icons/icon-192.png" },
  };
}

export const viewport = { themeColor: "#7e22ce" };

export default function PortalLayout({ children }) {
  return (
    <>
      <PwaRegister />
      {children}
    </>
  );
}
