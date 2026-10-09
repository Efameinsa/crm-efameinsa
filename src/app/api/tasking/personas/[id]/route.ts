import { db } from '@/lib/tasking/db';
import { exigirAdmin, fallo, json } from '@/lib/tasking/api';
import { filaPersona } from '@/lib/tasking/personas';

export async function PATCH(req: Request, ctx: RouteContext<'/api/tasking/personas/[id]'>) {
  const no = await exigirAdmin();
  if (no) return no;
  const { id } = await ctx.params;
  const fila = filaPersona(await req.json().catch(() => ({})));
  if (fila.nombre === '') return fallo('El nombre no puede quedar vacío.');
  const { data, error } = await db().from('personas').update(fila).eq('id', id).select('*').single();
  if (error) return fallo(error.message, 500);
  if (fila.activo === false) await db().from('mensajes').update({ estado: 'cancelado' }).eq('persona_id', id).eq('estado', 'pendiente');
  return json(data);
}
