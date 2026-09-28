// Charges £1 via Square for one AI-design-credit bundle, then records it in Supabase.
// Env (Netlify), same convention as majormanifestor-site's create-payment.js:
//   SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SQUARE_ENV ('sandbox' | 'production')
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE
//
// PRICING (direct instruction 2026-09-28): price per design = real measured Midjourney-wrapper
// cost per image + a flat 2p markup. designs_included = floor(100p / price_per_design_pence).
//
// PLACEHOLDER, NOT MEASURED YET: MJ_WRAPPER_COST_PENCE below is a guess-shaped placeholder, not a
// real number — there is no Midjourney-wrapper integration built or measured yet. This function
// will compute the WRONG designs_included until that real per-image cost is measured (same
// mmCostOf()-style discipline as Oracle) and this constant is replaced. Do not treat the number
// this currently produces as a real, promised figure to show a customer.
const MJ_WRAPPER_COST_PENCE = null; // set from real measurement before this ever goes live
const MARKUP_PENCE = 2;

function designsPerPound() {
  if (MJ_WRAPPER_COST_PENCE == null) {
    throw new Error('MJ_WRAPPER_COST_PENCE is not set — real generation cost has not been measured yet, refusing to sell bundles at a guessed price');
  }
  const pricePerDesignPence = MJ_WRAPPER_COST_PENCE + MARKUP_PENCE;
  return Math.floor(100 / pricePerDesignPence);
}

const TOKEN = process.env.SQUARE_ACCESS_TOKEN, LOCATION = process.env.SQUARE_LOCATION_ID;
const ENV = (process.env.SQUARE_ENV || 'production').toLowerCase();
const BASE = ENV === 'sandbox' ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';

async function insertBundle(userEmail, squarePaymentId, designsIncluded) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/design_credit_bundles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_ROLE,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      user_email: userEmail,
      amount_gbp: 1.00,
      designs_included: designsIncluded,
      square_payment_id: squarePaymentId
    })
  });
  if (!res.ok) throw new Error('Failed to record design credit bundle: ' + await res.text());
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows.length) throw new Error('Bundle insert returned no row — write may not have actually happened');
  return rows[0];
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  try {
    const body = JSON.parse(event.body || '{}');
    const { sourceId, userEmail } = body; // sourceId = a Square Web Payments SDK card nonce
    if (!sourceId || !userEmail) {
      return { statusCode: 400, body: JSON.stringify({ error: 'sourceId and userEmail are required' }) };
    }

    const designsIncluded = designsPerPound();

    const paymentRes = await fetch(`${BASE}/v2/payments`, {
      method: 'POST',
      headers: {
        'Square-Version': '2024-10-17',
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source_id: sourceId,
        idempotency_key: `gb-designbundle-${userEmail}-${Date.now()}`,
        amount_money: { amount: 100, currency: 'GBP' }, // £1.00, in pence
        location_id: LOCATION,
        note: 'Gobiteme AI design credit bundle'
      })
    });
    const paymentData = await paymentRes.json();
    if (!paymentRes.ok || !paymentData.payment) {
      return { statusCode: 402, body: JSON.stringify({ error: 'Payment failed', detail: paymentData }) };
    }

    const bundle = await insertBundle(userEmail, paymentData.payment.id, designsIncluded);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, bundle, designsIncluded })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
