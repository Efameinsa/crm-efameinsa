import { exigirAdmin, fallo, json } from '@/lib/tasking/api';
import { crearCompromiso } from '@/lib/tasking/compromisos';

export async function POST(req: Request) {
  const no = await exigirAdmin();
  if (no) return no;
  const b = await req.json().catch(() => ({}));
  if (!b.persona_id || !String(b.descripcion ?? '').trim()) return fallo('Indica el responsable y la tarea.');
  try {
    const c = await crearCompromiso({
      reunion_id: b.reunion_id ?? null,
      persona_id: b.persona_id,
      descripcion: String(b.descripcion).slice(0, 300),
      vence_en: b.vence_en ?? null,
      hora_definida: !!b.hora_definida,
    });
    return json(c);
  } catch (e) {
    return fallo((e as Error).message, 500);
  }
}
