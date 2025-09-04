import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs' };

/**
 * POST /api/upload
 * Body: { fileBase64, filename, contentType, metadata? }
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
 * Sube el archivo al bucket público 'voicedu-audios' y devuelve la URL pública.
 */
export default async function handler(req: any, res: any) {
  // --- CORS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // En Vercel (Node) normalmente req.body ya viene parseado si es JSON
    const { fileBase64, filename, contentType, metadata } = req.body || {};
    if (!fileBase64 || !filename) {
      return res.status(400).json({ error: 'Missing fileBase64 or filename' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Missing Supabase credentials' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const bucket = 'voicedu-audios';

    // Crear bucket si no existe (ignorar error si ya existe)
    try {
      await supabase.storage.createBucket(bucket, { public: true });
    } catch (_) {
      /* ignore if already exists */
    }

    // Aceptar dataURL o base64 "puro"
    const b64 = String(fileBase64).includes('base64,')
      ? String(fileBase64).split('base64,').pop()!
      : String(fileBase64);

    // Sanitizar filename y agregar timestamp
    const safeName = String(filename)
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 80);
    const path = `${Date.now()}-${safeName}`;

    const buffer = Buffer.from(b64, 'base64');

    // Content-Type por defecto a audio/mpeg si no llega
    const ct =
      contentType ||
      (safeName.toLowerCase().endsWith('.wav') ? 'audio/wav' : 'audio/mpeg');

    // Subida con cache-control para mejor CDN
    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: ct,
        upsert: false,
        cacheControl: '31536000, immutable', // 1 año
      });

    if (upErr) {
      return res.status(502).json({ error: upErr.message });
    }

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    return res.json({
      publicUrl: pub.publicUrl,
      path,
      metadata: metadata || null,
      contentType: ct,
    });
  } catch (e: any) {
    return res
      .status(500)
      .json({ error: e?.message || 'Unknown error during upload' });
  }
}
