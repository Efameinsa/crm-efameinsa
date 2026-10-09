import { notFound } from "next/navigation";
import { personasActivas } from '@/lib/tasking/consultas';
import { db } from '@/lib/tasking/db';
import type { Compromiso, Mensaje, Reunion } from '@/lib/tasking/tipos';
import Acta from '@/components/tasking/Acta';

export const metadata = { title: 'Acta' };

export default async function Pagina({ params }: PageProps<'/tasking/reuniones/[id]'>) {
  const { id } = await params;
  const { data } = await db().from('reuniones').select('*').eq('id', id).maybeSingle();
  if (!data) notFound();
  const [{ data: cs }, { data: ms }, personas] = await Promise.all([
    db().from('compromisos').select('*').eq('reunion_id', id).order('numero'),
    db().from('mensajes').select('id,canal,tipo,persona_id,destino,estado,error,enviar_en,enviado_en').eq('reunion_id', id).in('tipo', ['asignacion', 'reporte']).order('creado_en'),
    personasActivas(),
  ]);
  return (
    <Acta
      reunion={data as Reunion}
      compromisos={(cs ?? []) as Compromiso[]}
      mensajes={(ms ?? []) as Mensaje[]}
      personas={personas.map(({ id, nombre, cargo }) => ({ id, nombre, cargo }))}
    />
  );
}
