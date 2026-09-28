// "Dictation" mode — raw speech-to-text, straight into the prompt box, no AI cleanup. The separate
// "Smart Prompt" mode (see refine-prompt-agent.js) is the other half of the two options requested
// ("both the simple dictation and the agent too as separate options").
// Uses Groq's hosted whisper-large-v3-turbo (env var GROQ_API_KEY) — free tier (2,026-09-28: sign
// up at console.groq.com, no card needed), OpenAI-compatible /audio/transcriptions endpoint.
// Swapped from ElevenLabs Scribe (paid) specifically to keep this feature free to run.
const API_KEY = process.env.GROQ_API_KEY;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  try {
    if (!API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'GROQ_API_KEY not set — sign up free at console.groq.com and add the key to this site\'s Netlify env vars' }) };
    }

    const { audioBase64, mimeType } = JSON.parse(event.body || '{}');
    if (!audioBase64) return { statusCode: 400, body: JSON.stringify({ error: 'audioBase64 is required' }) };

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const form = new FormData();
    form.append('model', 'whisper-large-v3-turbo');
    form.append('file', new Blob([audioBuffer], { type: mimeType || 'audio/webm' }), 'speech.webm');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      body: form
    });
    const data = await res.json();
    if (!res.ok) return { statusCode: res.status, body: JSON.stringify({ error: 'Groq STT failed', detail: data }) };

    return { statusCode: 200, body: JSON.stringify({ ok: true, text: data.text || '' }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
