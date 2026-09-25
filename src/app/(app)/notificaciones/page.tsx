import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ListaNotificaciones, type AvisoLista } from "@/components/crm/lista-notificaciones";

export const dynamic = "force-dynamic";

const hace60Dias = () => new Date(Date.now() - 60 * 86400000).toISOString();

/**
 * TODAS MIS NOTIFICACIONES (25-09). Santos: «las notificaciones deberían tener
 * una lista, cuando le hagas clic, de todas las acciones… y al hacerle clic a
 * cada una debería ir a la ventana que corresponda». La campana muestra las
 * pendientes y las 15 más recientes; acá están las de los últimos 60 días,
 * por día, con filtro de sin leer. Cada una lleva a su pantalla.
 */
export default async function NotificacionesPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  await requerirPerfil();
  const soloSinLeer = (await searchParams).ver === "sin-leer";
  const supabase = await createClient();
  const desde = hace60Dias();
  let consulta = supabase
    .from("notificaciones")
    .select("id, tipo, titulo, cuerpo, url, leida_at, created_at")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(300);
  if (soloSinLeer) consulta = consulta.is("leida_at", null);
  const { data } = await consulta;
  const { count: sinLeer } = await supabase.from("notificaciones").select("id", { count: "exact", head: true }).is("leida_at", null);

  return (
    <SeccionPanel titulo="Mis notificaciones">
      <ListaNotificaciones avisos={(data ?? []) as AvisoLista[]} soloSinLeer={soloSinLeer} sinLeer={sinLeer ?? 0} />
    </SeccionPanel>
  );
}
