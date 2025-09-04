export const config = { runtime: 'edge' };

/**
 * POST /api/tts
 * Body: { text, voiceId, lang, format }
 * Returns: { audioBase64, mimeType }
 *
 * Si tu plan de Uberduck no soporta el endpoint síncrono (`speak-synchronous`),
 * este endpoint devolverá un 501 indicando que debes usar el flujo asíncrono.
 */
export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { text, voiceId, lang, format } = await req.json();
    if (!text || !voiceId) {
      return new Response(
        JSON.stringify({ error: 'Missing text or voiceId' }),
        { status: 400 }
      );
    }

    const key = process.env.UBERDUCK_API_KEY;
    if (!key) {
      return new Response(
        JSON.stringify({ error: 'Missing UBERDUCK_API_KEY' }),
        { status: 500 }
      );
    }

    // Endpoint síncrono de Uberduck (si tu plan lo soporta)
    const url = 'https://api.uberduck.ai/speak-synchronous';
    const payload = { speech: text, voice: voiceId, pace: 1.0 };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 404 || res.status === 501) {
      // Tu plan no soporta síncrono, necesitas usar async/polling
      return new Response(
        JSON.stringify({
          error:
            'Synchronous TTS not available on this plan. Use async Uberduck endpoint and polling.',
        }),
        { status: 501 }
      );
    }

    if (!res.ok) {
      const txt = await res.text();
      return new Response(
        JSON.stringify({ error: `Uberduck TTS error: ${txt}` }),
        { status: 502 }
      );
    }

    const data = await res.json();
    let base64: string | null = data?.audio || data?.audio_base64 || null;

    if (!base64 && data?.url) {
      // Si Uberduck devuelve solo una URL, la descargamos y la convertimos a base64
      const audioRes = await fetch(data.url);
      const buf = await audioRes.arrayBuffer();
      base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    }

    if (!base64) {
      return new Response(
        JSON.stringify({ error: 'No audio returned' }),
        { status: 502 }
      );
    }

    const mimeType = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
    return new Response(
      JSON.stringify({ audioBase64: base64, mimeType }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message || 'Unknown error' }),
      { status: 500 }
    );
  }
}
