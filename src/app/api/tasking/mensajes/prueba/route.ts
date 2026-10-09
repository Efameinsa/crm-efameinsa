import { enlacePersonal } from '@/lib/tasking/avisos';
import { db } from '@/lib/tasking/db';
import { exigirAdmin, fallo, json } from '@/lib/tasking/api';
import type { Persona } from '@/lib/tasking/tipos';

// Botón «Enviar prueba» del panel de equipo: confirma que el WhatsApp y el correo de esa persona funcionan.
export async function POST(req: Request) {
  const no = await exigirAdmin();
  if (no) return no;
  const { persona_id } = await req.json().catch(() => ({}));
  const { data } = await db().from('personas').select('*').eq('id', persona_id).maybeSingle();
  if (!data) return fallo('No existe esa persona.', 404);
  const p = data as Persona;
  const enlace = enlacePersonal(p);
  const filas = [];
  if (p.whatsapp)
    filas.push({ canal: 'whatsapp', tipo: 'prueba', persona_id: p.id, destino: p.whatsapp, cuerpo: `👋 Hola ${p.nombre.split(' ')[0]}, este es un mensaje de prueba de *Tasking*.\n\nPor aquí te llegarán tus compromisos de las reuniones y sus recordatorios.\n\nTu página personal: ${enlace}\nEscribe *ayuda tasking* para ver qué puedes responder.` });
  if (p.correo)
    filas.push({ canal: 'correo', tipo: 'prueba', persona_id: p.id, destino: p.correo, asunto: 'Prueba de Tasking', cuerpo: `Hola ${p.nombre}, este es un correo de prueba de Tasking. Tu página personal: ${enlace}`, html: `<p>Hola ${p.nombre}, este es un correo de prueba de <b>Tasking</b>. Por aquí te llegarán tus compromisos.</p><p><a href="${enlace}">Abrir mi página personal</a></p>` });
  if (!filas.length) return fallo('Esta persona no tiene WhatsApp ni correo registrados.');
  await db().from('mensajes').insert(filas);
  return json({ ok: true, canales: filas.map((f) => f.canal) });
}
