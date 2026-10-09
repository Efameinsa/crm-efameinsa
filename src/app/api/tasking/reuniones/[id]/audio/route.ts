import { BUCKET_AUDIO, db } from '@/lib/tasking/db';
import { fallo, json } from '@/lib/tasking/api';
import { puedeGrabar } from '@/lib/tasking/auth';

// Respaldo del audio en trozos de ~15 s (si los subtítulos fallan, Gemini escucha el audio).
export async function POST(req: Request, ctx: RouteContext<'/api/tasking/reuniones/[id]/audio'>) {
  const { id } = await ctx.params;
  if (!(await puedeGrabar(req, id))) return fallo('Solo el administrador del CRM usa Tasking.', 401);
  const n = Number(new URL(req.url).searchParams.get('n'));
  if (!Number.isInteger(n) || n < 0 || n > 99_999) return fallo('Número de parte inválido.');
  const cuerpo = new Uint8Array(await req.arrayBuffer());
  if (!cuerpo.length) return json({ ok: true });
  const { error } = await db()
    .storage.from(BUCKET_AUDIO)
    .upload(`${id}/${String(n).padStart(5, '0')}.webm`, cuerpo, { contentType: 'audio/webm', upsert: true });
  if (error) return fallo(error.message, 500);
  const { data: r } = await db().from('reuniones').select('audio_partes').eq('id', id).single();
  if (r && r.audio_partes < n + 1) await db().from('reuniones').update({ audio_partes: n + 1 }).eq('id', id);
  return json({ ok: true });
}
