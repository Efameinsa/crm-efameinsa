import { db } from '@/lib/tasking/db';
import { exigirAdmin, fallo, json } from '@/lib/tasking/api';

// Botones de la página WhatsApp: el worker recoge la orden en su siguiente latido (≤ 10 s).
export async function POST(req: Request) {
  const no = await exigirAdmin();
  if (no) return no;
  const { accion } = await req.json().catch(() => ({}));
  if (!['desvincular', 'qr_nuevo'].includes(accion)) return fallo('Acción inválida.');
  await db().from('ajustes').upsert({ clave: 'whatsapp_comando', valor: { accion, en: new Date().toISOString() }, actualizado_en: new Date().toISOString() });
  return json({ ok: true });
}
