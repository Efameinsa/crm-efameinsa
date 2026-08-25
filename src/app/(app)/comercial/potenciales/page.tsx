import { createClient } from "@/lib/supabase/server";
import { cargarPotenciales, lunesSemana } from "@/lib/potenciales-semana";
import { SemanaPotenciales } from "@/components/crm/semana-potenciales";
import { SeccionPanel } from "@/components/crm/seccion-panel";

export const dynamic = "force-dynamic";

/**
 * «Acá están mis potenciales, mi proyectado de esta semana que necesito
 * cerrar» (ing. Carlos, 25-08). La misma pregunta que él hace en la reunión —
 * ¿qué vas a vender mañana? ¿hacia dónde estás apuntando?— respondida por el
 * propio comercial con su cuadro.
 */
export default async function PotencialesComercialPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const lunes = lunesSemana(sp.semana);
  const { potenciales } = await cargarPotenciales(lunes, user?.id);
  const hoyISO = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" })).toISOString().slice(0, 10);

  return (
    <SeccionPanel titulo="Mis potenciales de la semana">
      <SemanaPotenciales lunes={lunes} potenciales={potenciales} esGerencia={false} hoyISO={hoyISO} />
    </SeccionPanel>
  );
}
