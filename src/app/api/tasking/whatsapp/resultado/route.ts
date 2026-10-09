import { claveServicioCorrecta } from '@/lib/tasking/auth';
import { db } from '@/lib/tasking/db';
import { fallo, json } from '@/lib/tasking/api';

export async function POST(req: Request) {
  if (!claveServicioCorrecta(req)) return fallo('Clave inválida.', 401);
  const { id, ok, error, reintentar } = await req.json().catch(() => ({}));
  if (!id) return fallo('Falta id.');
  if (ok) {
    await db().from('mensajes').update({ estado: 'enviado', enviado_en: new Date().toISOString(), error: null }).eq('id', id);
  } else {
    const { data: m } = await db().from('mensajes').select('intentos').eq('id', id).single();
    const final = !reintentar || (m?.intentos ?? 0) >= 5;
    await db()
      .from('mensajes')
      .update({ estado: final ? 'error' : 'pendiente', error: String(error ?? 'Error').slice(0, 500), enviar_en: new Date(Date.now() + 3 * 60_000).toISOString() })
      .eq('id', id);
  }
  return json({ ok: true });
}
