import { sesion } from '@/lib/tasking/auth';
import { compromisosTablero, titulosReuniones } from '@/lib/tasking/consultas';
import MisCompromisos from '@/components/tasking/MisCompromisos';

export const metadata = { title: 'Mis compromisos' };
export const dynamic = 'force-dynamic';

// Página del trabajador, sin cuenta del CRM: entra con el enlace personal que le
// llega por WhatsApp (/t/<token>), que deja una cookie firmada solo para esto.
export default async function Pagina() {
  const { persona } = await sesion();
  if (!persona)
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center text-sm text-slate-600">
        <h1 className="mb-2 text-lg font-semibold text-slate-900">Mis compromisos</h1>
        Abra el enlace personal que le llegó por WhatsApp para ver y marcar sus compromisos.
      </main>
    );
  const compromisos = await compromisosTablero({ personaId: persona.id, diasHechos: 30 });
  const reuniones = await titulosReuniones(compromisos.map((c) => c.reunion_id));
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <MisCompromisos persona={{ id: persona.id, nombre: persona.nombre }} compromisos={compromisos} reuniones={reuniones} />
    </main>
  );
}
