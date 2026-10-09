import { db } from '@/lib/tasking/db';
import { exigirAdmin, fallo, json } from '@/lib/tasking/api';
import { filaPersona } from '@/lib/tasking/personas';

export async function POST(req: Request) {
  const no = await exigirAdmin();
  if (no) return no;
  const fila = filaPersona(await req.json().catch(() => ({})));
  if (!fila.nombre) return fallo('Falta el nombre.');
  const { data, error } = await db().from('personas').insert(fila).select('*').single();
  if (error) return fallo(error.message, 500);
  return json(data);
}
