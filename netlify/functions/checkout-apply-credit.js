// Applies a user's full outstanding design-credit balance as a deduction line at checkout.
// Called once an order has been created (has a real order id) but BEFORE the customer is charged
// the final amount, so the discount is genuinely reflected in what they're asked to pay — never
// applied cosmetically after the fact. Marks every unapplied bundle as spent against this order
// (gb_apply_credit_to_order), so the same credit can never be shown/applied twice.
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  try {
    const { userEmail, orderId } = JSON.parse(event.body || '{}');
    if (!userEmail || !orderId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'userEmail and orderId are required' }) };
    }

    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/gb_apply_credit_to_order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`
      },
      body: JSON.stringify({ p_user_email: userEmail, p_order_id: orderId })
    });
    if (!res.ok) throw new Error('gb_apply_credit_to_order RPC failed: ' + await res.text());
    const creditAppliedGbp = await res.json();

    return { statusCode: 200, body: JSON.stringify({ ok: true, creditAppliedGbp }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
