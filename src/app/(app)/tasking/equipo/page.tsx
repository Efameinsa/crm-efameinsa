import { appUrl, db } from '@/lib/tasking/db';
import type { Persona } from '@/lib/tasking/tipos';
import Equipo from '@/components/tasking/Equipo';

export const metadata = { title: 'Equipo' };

export default async function Pagina() {
  const { data } = await db().from('personas').select('*').order('activo', { ascending: false }).order('nombre');
  return <Equipo personas={(data ?? []) as Persona[]} base={appUrl()} />;
}
