// POST /api/track — receive a lightweight visit event from a client preview
// page and store it in D1. No cookies, no third party, no raw IP stored.
// Body (JSON): { host, path, session, event: "view"|"dwell", dwell_ms, referrer }
// Env: DB — D1 database binding named DB (set on the Pages project).
// Note: visit alert emails are disabled (2026-11-15, owner request) —
// tracking inserts into D1 only, no email is sent.
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    if (!env.DB) {
      return Response.json({ ok: false, error: 'tracking not configured' }, { status: 503 });
    }
    let data;
    try {
      data = await request.json();
    } catch (e) {
      return Response.json({ ok: false, error: 'bad json' }, { status: 400 });
    }
    const host = (data.host || '').toString().trim().slice(0, 120);
    const path = (data.path || '').toString().trim().slice(0, 300);
    const session = (data.session || '').toString().trim().slice(0, 64);
    const event = (data.event || '').toString().trim();
    const referrer = (data.referrer || '').toString().trim().slice(0, 300);
    let dwell = Number(data.dwell_ms || 0);
    if (!Number.isFinite(dwell) || dwell < 0) dwell = 0;
    if (dwell > 3600000) dwell = 3600000;
    // Only accept events from our own preview domains.
    if (host !== 'revampwright.com' && !host.endsWith('.revampwright.com')) {
      return Response.json({ ok: false, error: 'bad host' }, { status: 400 });
    }
    if (!path || !session || (event !== 'view' && event !== 'dwell')) {
      return Response.json({ ok: false, error: 'bad event' }, { status: 400 });
    }
    const ua = (request.headers.get('user-agent') || '').slice(0, 300);
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO visits (host, path, session_id, event, dwell_ms, referrer, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(host, path, session, event, event === 'dwell' ? Math.round(dwell) : 0, referrer, ua, now).run();
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err).slice(0, 200) }, { status: 500 });
  }
}
