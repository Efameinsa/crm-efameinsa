import { personasActivas } from '@/lib/tasking/consultas';
import { ahoraMs, DIAS, MESES, partesLima } from '@/lib/tasking/fechas';
import Grabadora from '@/components/tasking/Grabadora';

export const metadata = { title: 'Grabar reunión' };

export default async function Pagina() {
  const personas = await personasActivas();
  const p = partesLima(ahoraMs());
  const tituloSugerido = `Reunión del ${DIAS[p.diaSemana]} ${p.dia} ${MESES[p.mes - 1]}`;
  return <Grabadora personas={personas.map(({ id, nombre, apodos }) => ({ id, nombre, apodos }))} tituloSugerido={tituloSugerido} />;
}
