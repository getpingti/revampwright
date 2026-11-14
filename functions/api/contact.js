// POST /api/contact — receive the estimate request form and email it via Resend.
// Env (set on the Pages project, never in code):
//   RESEND_API_KEY — Resend API key (secret)
//   CONTACT_TO     — recipient email address
//   CONTACT_FROM   — sender address (defaults to Resend's onboarding sender for tests)
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const form = await request.formData();
    const name = (form.get('name') || '').toString().trim();
    const project = (form.get('project') || '').toString().trim();
    const contact = (form.get('contact') || '').toString().trim();
    const notes = (form.get('notes') || '').toString().trim();
    if (!name && !contact) {
      return Response.json({ ok: false, error: 'missing name and contact' }, { status: 400 });
    }
    const to = env.CONTACT_TO;
    const from = env.CONTACT_FROM || 'onboarding@resend.dev';
    if (!env.RESEND_API_KEY || !to) {
      return Response.json({ ok: false, error: 'email not configured' }, { status: 503 });
    }
    const site = new URL(request.url).hostname;
    const referer = request.headers.get('referer') || '';
    const subject = 'New estimate request — ' + (name || 'website visitor') + ' (' + site + ')';
    const text =
      'Name: ' + name + '\n' +
      'Project type: ' + project + '\n' +
      'Phone or email: ' + contact + '\n' +
      'Anything we should know: ' + notes + '\n' +
      '\nFrom: ' + site + (referer ? '\nPage: ' + referer : '');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: from, to: to, subject: subject, text: text })
    });
    if (!res.ok) {
      const detail = await res.text();
      return Response.json({ ok: false, error: 'send failed', detail: detail.slice(0, 300) }, { status: 502 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err).slice(0, 300) }, { status: 500 });
  }
}
