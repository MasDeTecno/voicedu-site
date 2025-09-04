export const config = { runtime: 'edge' };

function json(data: any, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function basicAuth(key?: string, secret?: string) {
  if (!key || !secret) return '';
  const token = btoa(`${key}:${secret}`);
  return `Basic ${token}`;
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return json({ ok: true });
  try {
    const { searchParams } = new URL(req.url);
    const tag = (searchParams.get('tag') || '').toLowerCase();
    const language = (searchParams.get('language') || '').toLowerCase();
    const state = (searchParams.get('state') || '').toLowerCase();

    const auth = basicAuth(process.env.UBERDUCK_API_KEY, process.env.UBERDUCK_API_SECRET);
    if (!auth) return json({ error: 'Missing Uberduck credentials' }, { status: 500 });

    const udUrl = 'https://api.uberduck.ai/voices';
    const res = await fetch(udUrl, { headers: { Authorization: auth } });

    if (!res.ok) {
      // Fallback mock to validate UI quickly
      return json([
        { id: 'es_female_1', name: 'ES Femenina', language: 'spanish', sampleUrl: '', tags: ['celebrity'], state: 'ready' },
        { id: 'en_male_1', name: 'EN Male', language: 'english', sampleUrl: '', tags: ['narration'], state: 'ready' }
      ], { status: 200 });
    }

    const all: any[] = await res.json();

    const filtered = all
      .map(v => ({
        id: v?.uuid || v?.id || v?.voice_id || v?.name,
        name: v?.name || v?.display_name || 'Unknown',
        language: (v?.language || v?.lang || '').toString().toLowerCase(),
        sampleUrl: v?.preview_url || v?.sample || null,
        tags: (v?.tags || v?.category || []).map((x: any)=>String(x).toLowerCase()),
        state: (v?.state || 'ready').toLowerCase()
      }))
      .filter(v => language ? v.language.includes(language) : true)
      .filter(v => tag ? JSON.stringify(v.tags||[]).includes(tag) : true)
      .filter(v => state ? v.state.includes(state) : true)
      .filter(v => v.language.includes('english') || v.language.includes('spanish'))
      .slice(0, 120);

    return json(filtered);
  } catch (e: any) {
    return json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}
