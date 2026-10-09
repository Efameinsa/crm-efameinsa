import { db } from '@/lib/tasking/db';
import { fallo, json } from '@/lib/tasking/api';
import { puedeGrabar } from '@/lib/tasking/auth';

// Los subtítulos en vivo se guardan cada pocos segundos: si se cae la laptop, no se pierde lo hablado.
export async function POST(req: Request, ctx: RouteContext<'/api/tasking/reuniones/[id]/texto'>) {
  const { id } = await ctx.params;
  if (!(await puedeGrabar(req, id))) return fallo('Solo el administrador del CRM usa Tasking.', 401);
  const { texto } = await req.json().catch(() => ({}));
  if (typeof texto !== 'string' || !texto.trim()) return json({ ok: true });
  const { error } = await db().rpc('agregar_texto', { p_reunion: id, p_texto: texto.trim().slice(0, 50_000) });
  if (error) return fallo(error.message, 500);
  return json({ ok: true });
}
