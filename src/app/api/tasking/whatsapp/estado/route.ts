import { claveServicioCorrecta } from '@/lib/tasking/auth';
import { db } from '@/lib/tasking/db';
import { fallo, json } from '@/lib/tasking/api';

// El worker informa si está conectado y, mientras no lo esté, el QR para escanear desde la web.
// En la respuesta recibe la orden pendiente de la página WhatsApp (desvincular, QR nuevo).
export async function POST(req: Request) {
  if (!claveServicioCorrecta(req)) return fallo('Clave inválida.', 401);
  const b = await req.json().catch(() => ({}));
  const valor = {
    conectado: !!b.conectado,
    qr: b.conectado ? null : (b.qr ?? null),
    numero: b.numero ?? null,
    nombre: b.nombre ?? null,
    detalle: b.detalle ?? null,
    latido: new Date().toISOString(),
  };
  await db().from('ajustes').upsert({ clave: 'whatsapp', valor, actualizado_en: valor.latido });
  const { data: orden } = await db().from('ajustes').delete().eq('clave', 'whatsapp_comando').select('valor');
  const pendiente = orden?.[0]?.valor as { accion: string; en: string } | undefined;
  // Una orden de hace más de 5 minutos ya no vale (el worker estaba apagado cuando se pidió)
  const comando = pendiente && Date.now() - new Date(pendiente.en).getTime() < 5 * 60_000 ? pendiente.accion : null;
  return json({ ok: true, comando });
}
