export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Offline</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Dream Lux ERP is unavailable offline</h1>
        <p className="mt-3 text-sm text-muted">
          The app shell is still available, but this page needs a network connection. Reconnect to continue, and queued changes will sync automatically.
        </p>
      </div>
    </main>
  );
}
