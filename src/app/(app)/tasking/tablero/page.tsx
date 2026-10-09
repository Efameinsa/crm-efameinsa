import { compromisosTablero, personasActivas, titulosReuniones } from '@/lib/tasking/consultas';
import Tablero from '@/components/tasking/Tablero';

export const metadata = { title: 'Tablero' };

export default async function Inicio() {
  // El layout de /tasking ya exige rol admin.
  const admin = true;
  const persona = null as { id: string } | null;
  const [compromisos, personas] = await Promise.all([compromisosTablero(), personasActivas()]);
  const reuniones = await titulosReuniones(compromisos.map((c) => c.reunion_id));
  return (
    <Tablero
      compromisos={compromisos}
      personas={personas.map(({ id, nombre, cargo }) => ({ id, nombre, cargo }))}
      reuniones={reuniones}
      admin={admin}
      yo={persona?.id ?? null}
    />
  );
}
