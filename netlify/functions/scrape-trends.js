// INTERNAL RESEARCH TOOL — not customer-facing. Called from trend-research.html (admin page).
//
// Purpose: surface STYLE/TREND signals (colour palettes, motifs, typography, phrase patterns,
// themes) from currently-trending Etsy print-on-demand listings for a given search term, steered
// by an admin-supplied "what to identify" prompt. This deliberately does NOT ask Claude to
// describe any single listing closely enough to recreate it — only cross-listing patterns — to
// stay on the right side of design/copyright infringement (see conversation 2026-09-28: scraping
// specific images to build "very similar" designs is a real IP/ban risk for a paying storefront;
// this tool exists to give the design agent trend DIRECTION, not source material to clone).
//
// HONEST LIMITATION: Etsy runs bot detection against server-side/datacenter requests (which is
// what a Netlify function is). This fetch may get blocked or served a CAPTCHA/empty page instead
// of real results — that's reported back as an explicit error, not silently swallowed as "0
// trends found". If it's reliably blocked, this needs a different data source, not a workaround
// that fights Etsy's bot defences harder (that's just escalating the ToS problem).
//
// Uses the existing Anthropic key (env "claude", same as refine-prompt-agent.js) — Claude Sonnet 5
// is vision-capable, no new key needed. Images are passed by URL (not downloaded/base64'd here),
// so Claude fetches them directly.
const https = require('https');

const MAX_LISTINGS = 15;

function fetchEtsySearchHtml(searchTerm) {
  return new Promise((resolve, reject) => {
    const url = `https://www.etsy.com/search?q=${encodeURIComponent(searchTerm)}&explicit=1`;
    https.get(url, {
      headers: {
        // A realistic browser UA — without this Etsy blocks almost immediately.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, html: data }));
    }).on('error', reject);
  });
}

// Etsy listing cards reliably pair a thumbnail <img> with an alt attribute that IS the listing
// title, even when class names/markup churn. This is the most stable heuristic available without
// a full headless browser (which Netlify's free function runtime can't host anyway).
function extractListings(html) {
  const listings = [];
  const seen = new Set();
  const imgRe = /<img[^>]+src="(https:\/\/i\.etsystatic\.com\/[^"]+)"[^>]+alt="([^"]+)"/g;
  let m;
  while ((m = imgRe.exec(html)) && listings.length < MAX_LISTINGS) {
    const [, imageUrl, title] = m;
    if (seen.has(imageUrl)) continue;
    seen.add(imageUrl);
    listings.push({ imageUrl, title: title.replace(/&amp;/g, '&').replace(/&#39;/g, "'") });
  }
  return listings;
}

function callClaudeVision(listings, identifyInstructions) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.claude;
    if (!apiKey) return reject(new Error('Anthropic API key (env "claude") not set'));

    const systemPrompt = `You are a print-on-demand trend researcher. You are shown thumbnail images and titles from currently-listed Etsy products for a search term. Your job is to identify STYLE-LEVEL PATTERNS ACROSS the set — never to describe any single listing in enough detail that it could be recreated.

Rules:
- Report only patterns that repeat across multiple listings: colour palettes, typography/lettering styles, recurring motifs or subjects, composition patterns (e.g. "single-line quote centred over a small icon"), phrase/wording patterns, and general themes.
- NEVER describe one specific listing's exact composition, exact wording, or exact art in enough detail to reproduce it. If something is unique to one image, leave it out.
- The admin has asked you to specifically identify: "${identifyInstructions}" — focus your report on that, but stay within the pattern-only rule above.
- Output clear, short bullet points grouped under headings (e.g. "Colour palettes", "Motifs", "Typography", "Phrase patterns", "Themes") — only include headings that actually had repeating signal.
- Do not invent trends that aren't visible in what you were shown.`;

    const imageBlocks = listings.map(l => ({ type: 'image', source: { type: 'url', url: l.imageUrl } }));
    const titleList = listings.map((l, i) => `${i + 1}. ${l.title}`).join('\n');

    const payload = JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: `Listing titles, in the same order as the images above:\n${titleList}` }
        ]
      }]
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
    const { searchTerm, identifyInstructions } = JSON.parse(event.body || '{}');
    if (!searchTerm || !searchTerm.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'searchTerm is required' }) };
    }
    const instructions = (identifyInstructions || '').trim() || 'general style and theme trends';

    const { statusCode, html } = await fetchEtsySearchHtml(searchTerm.trim());
    if (statusCode !== 200) {
      return { statusCode: 502, body: JSON.stringify({ error: `Etsy returned HTTP ${statusCode} — likely blocked the request (bot detection). Not a code bug; this data source may not be reliably scrapable from a server.` }) };
    }

    const listings = extractListings(html);
    if (!listings.length) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Fetched the page but found no listing images — Etsy likely served a blocked/CAPTCHA page instead of real results, or their markup changed. Not reporting 0 trends as a real finding.' }) };
    }

    const trendReport = await callClaudeVision(listings, instructions);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        searchTerm: searchTerm.trim(),
        listingCount: listings.length,
        trendReport,
        // Included for human reference only — NOT for feeding into the design agent as source
        // material to copy. The trend-research.html UI labels these accordingly.
        sourceListings: listings
      })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
