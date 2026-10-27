// LiftLog OAuth proxy — the ONLY server-side piece.
//
// Why it exists: a static page cannot finish a GitHub sign-in on its own. The
// final step trades the ?code GitHub hands back for an access token, and that
// call needs the app's client secret (which must never ship in browser code)
// and hits an endpoint that sends no CORS headers. This Worker does that one
// exchange and nothing else — it never stores the token, it just hands it back
// to your app's origin.
//
// Deploy with wrangler (see README.md). It needs three settings:
//   GH_CLIENT_ID     (var)    your GitHub OAuth App client id
//   GH_CLIENT_SECRET (secret) your GitHub OAuth App client secret
//   ALLOWED_ORIGIN   (var)    your app's origin, e.g. https://mgmacri.github.io

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    let code;
    try { ({ code } = await request.json()); } catch { return json({ error: 'bad_request' }, 400); }
    if (!code) return json({ error: 'missing_code' }, 400);

    const r = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: env.GH_CLIENT_ID,
        client_secret: env.GH_CLIENT_SECRET,
        code,
      }),
    });
    const data = await r.json();
    // Pass GitHub's response straight through: { access_token, scope, token_type }
    // on success, or { error, error_description } on failure. The token is not logged or stored.
    return json(data, r.ok ? 200 : 502);
  },
};
