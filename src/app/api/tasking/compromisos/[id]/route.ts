import { sesion } from '@/lib/tasking/auth';
import { db } from '@/lib/tasking/db';
import { fallo, json } from '@/lib/tasking/api';
import { actualizarCompromiso, type CambioCompromiso } from '@/lib/tasking/compromisos';

const ESTADOS = ['pendiente', 'en_curso', 'hecho', 'anulado'];

// El operador puede cambiar todo. El trabajador solo el estado de SUS compromisos (y no anularlos).
export async function PATCH(req: Request, ctx: RouteContext<'/api/tasking/compromisos/[id]'>) {
  const { id } = await ctx.params;
  const { admin, persona } = await sesion();
  if (!admin && !persona) return fallo('Sin acceso.', 401);
  const b = await req.json().catch(() => ({}));
  const cambio: CambioCompromiso = {};
  if (b.estado !== undefined) {
    if (!ESTADOS.includes(b.estado)) return fallo('Estado inválido.');
    cambio.estado = b.estado;
  }
  if (!admin) {
    const { data: c } = await db().from('compromisos').select('persona_id').eq('id', id).maybeSingle();
    if (!c || c.persona_id !== persona!.id) return fallo('Ese compromiso no es tuyo.', 403);
    if (Object.keys(b).some((k) => k !== 'estado') || cambio.estado === 'anulado') return fallo('Solo puedes cambiar el estado.', 403);
  } else {
    if (b.descripcion !== undefined) cambio.descripcion = String(b.descripcion).trim().slice(0, 300);
    if (b.persona_id !== undefined) cambio.persona_id = b.persona_id || null;
    if (b.vence_en !== undefined) cambio.vence_en = b.vence_en || null;
    if (b.hora_definida !== undefined) cambio.hora_definida = !!b.hora_definida;
  }
  if (!Object.keys(cambio).length) return fallo('Nada que cambiar.');
  try {
    return json(await actualizarCompromiso(id, cambio));
  } catch (e) {
    return fallo((e as Error).message, 500);
  }
}
