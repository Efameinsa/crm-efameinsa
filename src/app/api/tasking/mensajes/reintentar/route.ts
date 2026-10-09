import { db } from '@/lib/tasking/db';
import { exigirAdmin, fallo, json } from '@/lib/tasking/api';

export async function POST() {
  const no = await exigirAdmin();
  if (no) return no;
  const { error } = await db().from('mensajes').update({ estado: 'pendiente', intentos: 0, error: null, enviar_en: new Date().toISOString() }).eq('estado', 'error');
  if (error) return fallo(error.message, 500);
  return json({ ok: true });
}
