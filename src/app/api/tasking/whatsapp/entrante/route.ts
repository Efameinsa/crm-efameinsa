import { claveServicioCorrecta } from '@/lib/tasking/auth';
import { enlacePersonal } from '@/lib/tasking/avisos';
import { actualizarCompromiso } from '@/lib/tasking/compromisos';
import { db } from '@/lib/tasking/db';
import { plazoTexto } from '@/lib/tasking/fechas';
import { fallo, json } from '@/lib/tasking/api';
import { normalizarWhatsapp } from '@/lib/tasking/telefono';
import { estaVencido, type Compromiso, type Persona } from '@/lib/tasking/tipos';

// Respuestas por WhatsApp: «listo 154» marca hecho, «pendientes» devuelve la lista.
// El WhatsApp vinculado es el número personal de Santos (09-10): solo se contesta a
// órdenes inequívocas; un «hola», «ok» o «ya» de un compañero es conversación normal.
export async function POST(req: Request) {
  if (!claveServicioCorrecta(req)) return fallo('Clave inválida.', 401);
  const { de, texto } = await req.json().catch(() => ({}));
  const numero = normalizarWhatsapp(de);
  const t = String(texto ?? '').trim().toLowerCase();
  if (!numero || !t) return json({});
  const { data: p } = await db().from('personas').select('*').eq('whatsapp', numero).eq('activo', true).maybeSingle();
  if (!p) return json({}); // número desconocido: no se responde
  const persona = p as Persona;

  const listo = t.match(/^(?:listo|hecho|terminado|termin[eé]|cumplido)\s*#?\s*(\d+(?:\s*[,y ]\s*#?\d+)*)$/i);
  if (listo) {
    const numeros = listo[1].split(/[^\d]+/).filter(Boolean).map(Number);
    const respuestas: string[] = [];
    for (const n of numeros) {
      const { data: c } = await db().from('compromisos').select('*').eq('numero', n).maybeSingle();
      if (!c || c.persona_id !== persona.id) respuestas.push(`No encontré el compromiso #${n} a tu nombre.`);
      else if (c.estado === 'hecho') respuestas.push(`#${n} ya estaba marcado como hecho.`);
      else if (c.estado === 'anulado') respuestas.push(`#${n} fue anulado, no hace falta marcarlo.`);
      else {
        await actualizarCompromiso(c.id, { estado: 'hecho' });
        respuestas.push(`✅ Listo: #${n} ${c.descripcion}`);
      }
    }
    const { count } = await db().from('compromisos').select('id', { count: 'exact', head: true }).eq('persona_id', persona.id).in('estado', ['pendiente', 'en_curso']);
    return json({ respuesta: `${respuestas.join('\n')}\n\n${count ? `Te ${count === 1 ? "queda 1 pendiente" : `quedan ${count} pendientes`}.` : '¡No te quedan pendientes! 🎉'}` });
  }

  if (/^(pendientes|mis pendientes|mis compromisos)$/.test(t)) {
    const { data } = await db().from('compromisos').select('*').eq('persona_id', persona.id).in('estado', ['pendiente', 'en_curso']).order('vence_en', { ascending: true, nullsFirst: false });
    const lista = (data ?? []) as Compromiso[];
    if (!lista.length) return json({ respuesta: '¡No tienes compromisos pendientes! 🎉' });
    return json({
      respuesta: `📋 *Tus pendientes (${lista.length})*\n\n${lista.map((c) => `${estaVencido(c) ? '🔴' : '•'} ${c.descripcion}\n   ⏰ ${plazoTexto(c.vence_en, c.hora_definida)} · #${c.numero}`).join('\n')}\n\nResponde *listo* y el número cuando termines uno.\n${enlacePersonal(persona)}`,
    });
  }

  if (/^(ayuda tasking|tasking)$/.test(t)) {
    return json({ respuesta: '🤖 Tasking, el asistente de compromisos.\n\n• *pendientes*: tu lista\n• *listo 154*: marca el #154 como hecho\n• *listo 154, 160*: varios a la vez' });
  }
  return json({});
}
