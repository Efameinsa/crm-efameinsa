import { claveServicioCorrecta } from '@/lib/tasking/auth';
import { db } from '@/lib/tasking/db';
import { fallo, json } from '@/lib/tasking/api';

// El worker pide los mensajes de WhatsApp que ya tocan (quedan marcados «enviando»).
export async function POST(req: Request) {
  if (!claveServicioCorrecta(req)) return fallo('Clave inválida.', 401);
  const { limite } = await req.json().catch(() => ({}));
  const { data, error } = await db().rpc('tomar_mensajes', { p_canal: 'whatsapp', p_limite: Math.min(Number(limite) || 5, 20) });
  if (error) return fallo(error.message, 500);
  // `imagen` (0536): los avisos de la prueba del recorrido llevan la ilustración del mensaje; el bot la manda con el texto como leyenda.
  return json({ mensajes: (data ?? []).map((m: { id: string; destino: string; cuerpo: string; imagen?: string | null }) => ({ id: m.id, destino: m.destino, cuerpo: m.cuerpo, imagen: m.imagen ?? null })) });
}
