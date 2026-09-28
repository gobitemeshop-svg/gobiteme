// Read-only — the design engine / basket UI calls this to SHOW the running credit balance
// ("Design credit available: £3.00") and remaining design allowance before checkout happens,
// without spending anything. Netlify needs its own handler per file (a second export on
// checkout-apply-credit.js is not independently reachable over HTTP), hence a separate function.
exports.handler = async function (event) {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  try {
    const userEmail = event.httpMethod === 'GET'
      ? (event.queryStringParameters || {}).userEmail
      : JSON.parse(event.body || '{}').userEmail;
    if (!userEmail) return { statusCode: 400, body: JSON.stringify({ error: 'userEmail is required' }) };

    const headers = {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_ROLE,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`
    };

    const [balanceRes, remainingRes] = await Promise.all([
      fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/gb_credit_balance`, {
        method: 'POST', headers, body: JSON.stringify({ p_user_email: userEmail })
      }),
      fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/gb_designs_remaining`, {
        method: 'POST', headers, body: JSON.stringify({ p_user_email: userEmail })
      })
    ]);
    if (!balanceRes.ok) throw new Error('gb_credit_balance RPC failed: ' + await balanceRes.text());
    if (!remainingRes.ok) throw new Error('gb_designs_remaining RPC failed: ' + await remainingRes.text());

    const creditBalanceGbp = await balanceRes.json();
    const designsRemaining = await remainingRes.json();

    return { statusCode: 200, body: JSON.stringify({ ok: true, creditBalanceGbp, designsRemaining }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
