export default function AppLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-56 rounded-md bg-slate-200" />
        <div className="h-4 w-80 rounded-md bg-slate-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="h-24 rounded-lg border border-slate-200 bg-white p-4" />
        <div className="h-24 rounded-lg border border-slate-200 bg-white p-4" />
        <div className="h-24 rounded-lg border border-slate-200 bg-white p-4" />
        <div className="h-24 rounded-lg border border-slate-200 bg-white p-4" />
      </div>
      <div className="h-72 rounded-lg border border-slate-200 bg-white p-6" />
    </div>
  );
}
