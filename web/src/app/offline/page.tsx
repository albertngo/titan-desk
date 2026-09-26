export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">You are offline</h1>
      <p className="mt-2 text-zinc-600">Titan Desk needs a connection to show current prices and stock. Reconnect and try again.</p>
    </main>
  );
}
