import { db } from '@/lib/tasking/db';
import { exigirAdmin, fallo, json } from '@/lib/tasking/api';

export async function POST(req: Request) {
  const no = await exigirAdmin();
  if (no) return no;
  const { titulo, participantes } = await req.json().catch(() => ({}));
  const { data, error } = await db()
    .from('reuniones')
    .insert({ titulo: String(titulo || 'Reunión').slice(0, 120), participantes: Array.isArray(participantes) ? participantes : [] })
    .select('id, inicio')
    .single();
  if (error) return fallo(error.message, 500);
  return json(data);
}
