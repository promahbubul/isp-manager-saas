import Topbar from "./Topbar";

const ContentArea = ({ children }) => {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-slate-50 text-slate-900">
      <Topbar />
      <main className="flex-1 overflow-y-auto p-6 print:overflow-visible print:p-0">{children}</main>
    </div>
  );
};

export default ContentArea;
