// Called by the design engine IMMEDIATELY BEFORE firing a real AI image-generation call — never
// after. Atomically checks the user has at least one design allowance left across their unapplied
// bundles and deducts it in the same database call (gb_consume_design, oldest bundle first, row-
// locked so two simultaneous requests can't both spend the same last credit). If this returns
// false, the caller MUST refuse to generate — a generation must never happen "on trust" with
// billing reconciled afterwards, since that's exactly the abuse path the whole credit system
// exists to prevent ("we cannot ever be F'd over by anyone simply doing loads of designs without
// actually getting an order").
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  try {
    const { userEmail } = JSON.parse(event.body || '{}');
    if (!userEmail) return { statusCode: 400, body: JSON.stringify({ error: 'userEmail is required' }) };

    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/gb_consume_design`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`
      },
      body: JSON.stringify({ p_user_email: userEmail })
    });
    if (!res.ok) throw new Error('gb_consume_design RPC failed: ' + await res.text());
    const consumed = await res.json(); // true/false

    return { statusCode: 200, body: JSON.stringify({ ok: true, consumed }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
