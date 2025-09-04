import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs' };

/**
 * POST /api/upload
 * Body: { fileBase64, filename, contentType, metadata? }
 * Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE to upload to bucket 'voicedu-audios' (public).
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  try {
    const { fileBase64, filename, contentType, metadata } = req.body || {};
    if (!fileBase64 || !filename) return res.status(400).json({ error: 'Missing fileBase64 or filename' });

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE;
    if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Missing Supabase credentials' });

    const supabase = createClient(supabaseUrl, supabaseKey);
    const bucket = 'voicedu-audios';

    // Ensure bucket exists (ignore if already exists)
    try { await supabase.storage.createBucket(bucket, { public: true }); } catch (_) {}

    const buffer = Buffer.from(fileBase64, 'base64');
    const path = `${Date.now()}-${filename}`;

    const { error } = await supabase.storage.from(bucket).upload(path, buffer, { contentType: contentType || 'application/octet-stream', upsert: false });
    if (error) return res.status(502).json({ error: error.message });

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    return res.json({ publicUrl: pub.publicUrl, path, metadata: metadata || null });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
