export const config = { runtime: 'edge' };

/**
 * POST /api/tts
 * Body: { text, voiceId, lang, format }
 * Returns: { audioBase64, mimeType }
 *
 * NOTE: Uberduck offers multiple endpoints; if 'speak-synchronous' is not available on your plan,
 * switch to their async endpoint and poll for completion.
 */
export default async function handler(req: Request) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  try {
    const { text, voiceId, lang, format } = await req.json();
    if (!text || !voiceId) return new Response(JSON.stringify({ error: 'Missing text or voiceId' }), { status: 400 });

    const key = process.env.UBERDUCK_API_KEY;
    const secret = process.env.UBERDUCK_API_SECRET;
    if (!key || !secret) return new Response(JSON.stringify({ error: 'Missing Uberduck credentials' }), { status: 500 });

    // Attempt synchronous endpoint
    const url = 'https://api.uberduck.ai/speak-synchronous';
    const payload = { speech: text, voice: voiceId, pace: 1.0 };
    const auth = 'Basic ' + btoa(`${key}:${secret}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.status === 404 || res.status === 501) {
      // Fallback instructing to switch to async flow
      return new Response(JSON.stringify({ error: 'Synchronous TTS not available on this plan. Use async Uberduck endpoint and polling.' }), { status: 501 });
    }
    if (!res.ok) {
      const txt = await res.text();
      return new Response(JSON.stringify({ error: `Uberduck TTS error: ${txt}` }), { status: 502 });
    }

    // Some Uberduck responses return { audio: base64 } or a URL. Try to normalize:
    const data = await res.json();
    let base64: string | null = data?.audio || data?.audio_base64 || null;
    if (!base64 && data?.url) {
      // If a URL is returned, fetch and convert to base64:
      const audioRes = await fetch(data.url);
      const buf = await audioRes.arrayBuffer();
      base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    }
    if (!base64) return new Response(JSON.stringify({ error: 'No audio returned' }), { status: 502 });

    const mimeType = (format === 'wav') ? 'audio/wav' : 'audio/mpeg';
    return new Response(JSON.stringify({ audioBase64: base64, mimeType }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Unknown error' }), { status: 500 });
  }
}
