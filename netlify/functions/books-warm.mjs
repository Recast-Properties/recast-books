// netlify/functions/books-warm.mjs — Netlify scheduled function, every 5 minutes.
// Kicks the background warmer (books-warm-background.mjs) so every tab's snapshot is
// always present and younger than its TTL; the request itself returns at once.
export const config = { schedule: "*/5 * * * *" };

export default async () => {
  const base = process.env.URL || "";
  const secret = process.env.POLLER_SECRET || "";
  if (!base || !secret) return new Response("warm: URL or POLLER_SECRET unset", { status: 500 });
  const res = await fetch(`${base}/api/warm-bg`, { method: "POST", headers: { "x-poller-secret": secret } });
  return new Response(`warm-bg invoked: ${res.status}`, { status: 200 });
};
