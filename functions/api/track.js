// POST /api/track — receive a lightweight visit event from a client preview
// page and store it in D1. No cookies, no third party, no raw IP stored.
// Body (JSON): { host, path, session, event: "view"|"dwell", dwell_ms, referrer }
// Env: DB — D1 database binding named DB (set on the Pages project).
// Env: RESEND_API_KEY, NOTIFY_TO — first view of a new session sends a
// best-effort alert email to the owner (never blocks the tracking insert).
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
    // Alert the owner on the first view of a new session (best effort).
    if (event === 'view') {
      try {
        const row = await env.DB.prepare(
          'SELECT COUNT(*) AS c FROM visits WHERE session_id = ?'
        ).bind(session).first();
        if (row && row.c === 1 && env.RESEND_API_KEY && env.NOTIFY_TO) {
          const when = new Date(now).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
          const body =
            'A client preview was just opened.\n\n' +
            'Host: ' + host + '\n' +
            'Page: ' + path + '\n' +
            'Time: ' + when + '\n' +
            'Referrer: ' + (referrer || '(none)') + '\n' +
            'Browser: ' + ua + '\n';
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + env.RESEND_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: env.NOTIFY_FROM || 'onboarding@resend.dev',
              to: [env.NOTIFY_TO],
              subject: 'Preview opened: ' + host + path,
              text: body,
            }),
          });
        }
      } catch (e) {
        // Notification is best effort; tracking already recorded.
      }
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err).slice(0, 200) }, { status: 500 });
  }
}
