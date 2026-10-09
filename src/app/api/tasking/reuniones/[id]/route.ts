import { db } from '@/lib/tasking/db';
import { exigirAdmin, fallo, json } from '@/lib/tasking/api';

export async function GET(_req: Request, ctx: RouteContext<'/api/tasking/reuniones/[id]'>) {
  const no = await exigirAdmin();
  if (no) return no;
  const { id } = await ctx.params;
  const { data } = await db().from('reuniones').select('id, estado, error, titulo').eq('id', id).maybeSingle();
  if (!data) return fallo('No existe la reunión.', 404);
  const { count } = await db().from('compromisos').select('id', { count: 'exact', head: true }).eq('reunion_id', id);
  return json({ ...data, compromisos: count ?? 0 });
}

export async function PATCH(req: Request, ctx: RouteContext<'/api/tasking/reuniones/[id]'>) {
  const no = await exigirAdmin();
  if (no) return no;
  const { id } = await ctx.params;
  const { titulo } = await req.json().catch(() => ({}));
  if (!titulo) return fallo('Falta el título.');
  await db().from('reuniones').update({ titulo: String(titulo).slice(0, 120) }).eq('id', id);
  return json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/tasking/reuniones/[id]'>) {
  const no = await exigirAdmin();
  if (no) return no;
  const { id } = await ctx.params;
  const { data: cs } = await db().from('compromisos').select('id').eq('reunion_id', id);
  if (cs?.length) await db().from('mensajes').update({ estado: 'cancelado' }).in('compromiso_id', cs.map((c) => c.id)).eq('estado', 'pendiente');
  await db().from('compromisos').delete().eq('reunion_id', id);
  await db().from('reuniones').delete().eq('id', id);
  return json({ ok: true });
}
