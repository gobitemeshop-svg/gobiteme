// "Smart Prompt" mode — the other of the two speech-input options ("both the simple dictation and
// the agent too as separate options"). Takes the raw spoken transcript (from speech-to-text.js)
// and turns loose, rambling spoken description into a well-formed AI image-generation prompt,
// since people talk in casual, unstructured phrasing that doesn't get the best results from an
// image model if sent verbatim. Uses the same Anthropic API convention as majormanifestor-site's
// gemini-reading.js (env var "claude", model claude-sonnet-5, x-api-key header).
const https = require('https');

const SYSTEM_PROMPT = `You turn a person's loose, spoken description of an image they want into a single, well-formed AI image-generation prompt. Rules:
- Preserve every genuine detail and intent they actually said — never invent new subject matter, colours, or style choices they didn't mention or clearly imply.
- Clean up filler words, false starts, and rambling into clear, concrete, well-ordered descriptive language.
- If they mention a style (e.g. "watercolour-y", "moody", "cartoon") keep and sharpen it into proper art-direction language.
- Output ONLY the finished prompt text, nothing else — no preamble, no explanation, no quote marks around it.`;

function callClaude(transcript) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.claude;
    if (!apiKey) return reject(new Error('Anthropic API key (env "claude") not set'));

    const payload = JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }]
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) return reject(new Error('Anthropic API error: ' + data));
          const text = (parsed.content || []).map(c => c.text || '').join('').trim();
          resolve(text);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  try {
    const { transcript } = JSON.parse(event.body || '{}');
    if (!transcript || !transcript.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'transcript is required' }) };
    }
    const refinedPrompt = await callClaude(transcript.trim());
    return { statusCode: 200, body: JSON.stringify({ ok: true, refinedPrompt }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
