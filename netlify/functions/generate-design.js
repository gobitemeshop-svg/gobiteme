// The core AI design-generation endpoint. Credit-gated: consumes one design allowance FIRST,
// atomically, and only calls the actual image generator if that succeeds — never the other way
// round (see consume-design-credit.js's own comment for why order matters here).
//
// NOT YET WIRED TO A REAL PROVIDER: Midjourney has no official API, so this needs a third-party
// wrapper service (e.g. useapi.net / goapi.ai / imagineapi.dev — real options, but which one
// hasn't been chosen yet, and each has a different request shape). callMidjourneyWrapper() below
// is a deliberate, clearly-marked placeholder so the REST of this function (credit gating,
// request/response shape, reference-image passthrough) is real and correct now, and wiring in the
// actual provider later is a small, contained change to one function rather than a rewrite.
async function callMidjourneyWrapper(prompt, referenceImageUrl) {
  const apiKey = process.env.MJ_WRAPPER_API_KEY;
  const baseUrl = process.env.MJ_WRAPPER_BASE_URL;
  if (!apiKey || !baseUrl) {
    throw new Error('Midjourney wrapper not configured yet (MJ_WRAPPER_API_KEY / MJ_WRAPPER_BASE_URL) — no provider has been chosen/signed up for, this is a real gap, not a bug');
  }
  // Actual request shape depends entirely on whichever wrapper gets chosen — left unimplemented
  // deliberately rather than guessed, since a wrong guess here would look like it works and then
  // fail confusingly the first real time it's called.
  throw new Error('callMidjourneyWrapper: provider chosen but request format not yet implemented');
}

async function consumeCredit(userEmail) {
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
  return res.json(); // true/false
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  try {
    const { userEmail, prompt, referenceImageUrl } = JSON.parse(event.body || '{}');
    if (!userEmail || !prompt || !prompt.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'userEmail and prompt are required' }) };
    }

    const consumed = await consumeCredit(userEmail);
    if (!consumed) {
      return {
        statusCode: 402,
        body: JSON.stringify({ error: 'no_credit', message: 'You’re out of design credits — buy another £1 bundle to keep designing.' })
      };
    }

    // Credit is already spent at this point. If the generation call itself fails below, that
    // spent credit is genuinely lost to a real provider error, not refunded automatically —
    // deliberately flagging this as a real open question rather than quietly deciding it: should
    // a provider-side failure (not the user's fault) refund the consumed credit? Needs an answer
    // before this goes live, not a silent assumption either way.
    const imageUrl = await callMidjourneyWrapper(prompt.trim(), referenceImageUrl);

    return { statusCode: 200, body: JSON.stringify({ ok: true, imageUrl }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
