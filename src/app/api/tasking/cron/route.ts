import { after } from 'next/server';
import { claveServicioCorrecta } from '@/lib/tasking/auth';
import { tareasProgramadas } from '@/lib/tasking/avisos';
import { procesarReunion, reintentarFallidas } from '@/lib/tasking/compromisos';
import { enviarCorreosPendientes } from '@/lib/tasking/correo';
import { fallo, json } from '@/lib/tasking/api';

export const maxDuration = 300;

// Lo llama Supabase (pg_cron) cada minuto, y también el worker de WhatsApp como respaldo.
export async function GET(req: Request) {
  if (!claveServicioCorrecta(req)) return fallo('Clave inválida.', 401);
  const tareas = await tareasProgramadas();
  const correo = await enviarCorreosPendientes();
  const reintento = await reintentarFallidas();
  if (reintento) after(() => procesarReunion(reintento));
  return json({ ok: true, tareas, correo, reintento });
}
