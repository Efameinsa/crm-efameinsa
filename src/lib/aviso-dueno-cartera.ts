import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { notificar } from "@/lib/notificaciones";

/**
 * Avisa al dueño de la cartera que otra persona corrigió los datos de su
 * cliente (0561: Brenda tiene poder global sobre las fichas). «Todos ven todo,
 * pero cada acción con su nombre» (gerencia 20-10). No avisa si el cliente no
 * tiene dueño o si quien corrige es el mismo dueño.
 */
export async function avisarAlDuenoDeLaCartera(cuentaId: string, queHizo: string): Promise<void> {
  const perfil = await requerirPerfil();
  if (!perfil.edita_clientes_global) return;
  const supabase = await createClient();
  const { data: cuenta } = await supabase.from("cuentas").select("comercial_id, razon_social").eq("id", cuentaId).maybeSingle();
  if (!cuenta?.comercial_id || cuenta.comercial_id === perfil.id) return;
  await notificar({
    userId: cuenta.comercial_id as string,
    tipo: "otro",
    titulo: `${perfil.nombre} ${queHizo} ${cuenta.razon_social as string}`,
    cuerpo: "Lo hizo con el permiso de corregir los datos de cualquier cliente. Si fue un error, operaciones lo puede deshacer.",
    url: `/nuevo/cliente/${cuentaId}?tab=contactos`,
  });
}
