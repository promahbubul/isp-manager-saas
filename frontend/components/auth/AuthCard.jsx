import Link from "next/link";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "ISP Manager";

export default function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-900 px-4 py-10">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-2xl shadow-purple-900/40 sm:p-10">
        <Link href="/" className="mb-8 block text-center text-2xl font-extrabold italic text-purple-700">
          {APP_NAME}
        </Link>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mb-6 mt-1 text-sm text-slate-500">{subtitle}</p>}
        {children}
        {footer && <div className="mt-6 text-center text-sm text-slate-600">{footer}</div>}
      </div>
    </div>
  );
}
