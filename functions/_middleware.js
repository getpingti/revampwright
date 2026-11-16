// Route client subdomains to their preview directory, served as the live site.
// e.g. sanderscabinetry.revampwright.com/gallery.html -> /p/sanders-921c0d55/gallery.html
// The preview pages auto-unlock when served on a *.revampwright.com subdomain
// (see the setDone() call in the preview pages), so the subdomain shows the
// live (unlocked) site while the /p/ path keeps showing the locked preview.
const CLIENTS = {
  'sanderscabinetry.revampwright.com': 'sanders-921c0d55',
  'cherokeecabinets.revampwright.com': 'cherokee-e3e05375',
  'fallscabinet.revampwright.com': 'falls-a9c6953a',
  'dickscabinets.revampwright.com': 'dicks-e2469975',
  'jensencabinet.revampwright.com': 'jensen-79732e95',
};

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const dir = CLIENTS[url.hostname];
  if (!dir) return context.next();
  let p = url.pathname;
  // Shared assets, API routes and already-prefixed preview paths pass through unchanged.
  if (p.startsWith('/assets/') || p.startsWith('/api/') || p.startsWith('/p/' + dir + '/')) {
    return context.next();
  }
  // Serve the directory path itself so Pages returns the index directly
  // (rewriting to /index.html makes Pages 308-redirect to the directory URL,
  // which would expose the /p/ preview path in the address bar).
  if (p === '/') p = '/';
  // Strip a trailing .html so Pages serves the page extensionless (200) instead
  // of 308-redirecting the rewritten /p/ path into the address bar.
  if (p.endsWith('.html')) p = p.slice(0, -5);
  const rewritten = new URL(url);
  rewritten.pathname = '/p/' + dir + p;
  const req = new Request(rewritten.toString(), context.request);
  try {
    if (context.env.ASSETS) return await context.env.ASSETS.fetch(req);
  } catch (e) { /* fall through to next() */ }
  return context.next(req);
}
