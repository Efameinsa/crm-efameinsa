import { createAdminClient } from '@/lib/supabase/admin';
import { db } from '@/lib/tasking/db';
import { exigirAdmin, fallo, json } from '@/lib/tasking/api';
import { normalizarWhatsapp } from '@/lib/tasking/telefono';

// «Traer al personal del CRM»: crea en Equipo a cada cuenta real activa del CRM
// (sin las de práctica, propuesta o prueba), enlazada a su perfil, con su correo y
// su celular. Las que ya estaban enlazadas no se tocan. Así el aviso de
// «su sugerencia ya está lista» encuentra el WhatsApp de quien la dejó.
const NO_ES_PERSONA = /pr[aá]ctica|propuesta|prueba|test|\(área\)|^administrador|^gerencia comercial|^comercial c\d|^central$|^almac[eé]n$|^facturaci[oó]n \d/i;

const CARGO: Record<string, string> = {
  admin: 'Administración',
  gerencia: 'Gerencia',
  central: 'Central',
  comercial: 'Comercial',
  operaciones: 'Operaciones',
  finanzas: 'Finanzas',
  facturacion: 'Facturación',
};

export async function POST() {
  const no = await exigirAdmin();
  if (no) return no;
  const admin = createAdminClient();
  const [{ data: perfiles, error }, { data: ya }, usuarios] = await Promise.all([
    admin.from('perfiles').select('id, nombre, rol, email_contacto, celular, activo').eq('activo', true),
    db().from('personas').select('perfil_id'),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  if (error) return fallo(error.message, 500);
  const enlazados = new Set((ya ?? []).map((p: { perfil_id: string | null }) => p.perfil_id).filter(Boolean));
  const correoDe = new Map((usuarios.data?.users ?? []).map((u) => [u.id, u.email ?? null]));
  const filas = (perfiles ?? [])
    .filter((p) => !enlazados.has(p.id) && !NO_ES_PERSONA.test(p.nombre ?? ''))
    .map((p) => {
      const correo = (p.email_contacto || correoDe.get(p.id) || '').toLowerCase();
      return {
        perfil_id: p.id,
        nombre: String(p.nombre).trim(),
        cargo: CARGO[p.rol as string] ?? '',
        correo: correo && !correo.endsWith('.local') ? correo : null,
        whatsapp: normalizarWhatsapp(p.celular),
        es_gerencia: p.rol === 'gerencia',
      };
    });
  if (!filas.length) return json({ creadas: 0 });
  const { error: e2 } = await db().from('personas').insert(filas);
  if (e2) return fallo(e2.message, 500);
  return json({ creadas: filas.length, sinWhatsapp: filas.filter((f) => !f.whatsapp).map((f) => f.nombre) });
}
