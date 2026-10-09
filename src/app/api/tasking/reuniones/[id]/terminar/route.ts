import { after } from 'next/server';
import { db } from '@/lib/tasking/db';
import { exigirAdmin, fallo, json } from '@/lib/tasking/api';
import { procesarReunion } from '@/lib/tasking/compromisos';

export const maxDuration = 300;

// Cierra la reunión y la procesa en segundo plano (también sirve para «Volver a procesar»).
export async function POST(_req: Request, ctx: RouteContext<'/api/tasking/reuniones/[id]/terminar'>) {
  const no = await exigirAdmin();
  if (no) return no;
  const { id } = await ctx.params;
  const { data: r } = await db().from('reuniones').select('estado, fin').eq('id', id).maybeSingle();
  if (!r) return fallo('No existe la reunión.', 404);
  if (r.estado === 'procesando') return json({ ok: true, estado: 'procesando' });
  await db().from('reuniones').update({ estado: 'procesando', fin: r.fin ?? new Date().toISOString(), error: null }).eq('id', id);
  after(() => procesarReunion(id));
  return json({ ok: true, estado: 'procesando' });
}
