import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { RegistroCaso } from "@/components/crm/registro-caso";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Registrar un caso técnico, en la pantalla donde se atiende la llamada.
 *
 * Existe porque el teléfono del área ya no pasa por Central: «las llamadas van
 * a ir para Hever, directamente» (Ariana, 27-08). Lo que Central deriva sigue
 * llegando como antes; esto es para el cliente que llama y cuenta que su
 * lavadora no lava.
 *
 * Se puede llegar con el cliente ya puesto (`?cuenta=…`), que es como se entra
 * desde la ficha del cliente. La pregunta de la señorita de postventa el 09-09
 * fue exactamente esa: estaba parada en la ficha de PANASERVICE, había atendido
 * al cliente, Central no lo había subido, y desde ahí no había ningún botón que
 * llevara acá.
 */
export default async function NuevoCasoPage({
  searchParams,
}: {
  searchParams: Promise<{ cuenta?: string }>;
}) {
  const { cuenta: cuentaId } = await searchParams;

  // Se lee la ficha para mostrar el nombre, no solo el id: llegar a un
  // formulario que dice «cliente: 1e8dc2e7-…» no es llegar con el cliente
  // puesto. Si el id no existe o no se puede ver, se sigue sin él y el
  // formulario pide el cliente como siempre.
  let cuentaInicial: { id: string; razonSocial: string } | null = null;
  if (cuentaId) {
    const supabase = await createClient();
    const { data } = await supabase.from("cuentas").select("id, razon_social").eq("id", cuentaId).maybeSingle();
    if (data) cuentaInicial = { id: data.id as string, razonSocial: data.razon_social as string };
  }

  return (
    <SeccionPanel
      titulo="Registrar un caso"
      accion={
        <Link href="/postventa/casos" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <ArrowLeft className="size-3.5" /> Volver a los casos
        </Link>
      }
    >
      <p className="mb-4 max-w-prose text-xs text-muted-foreground">
        Pida siempre primero el <strong>número de serie</strong>: con eso aparecen el cliente, la garantía, los ciclos y
        el último mantenimiento, y ya se sabe si esto se cobra antes de terminar de escuchar el problema. Si no la
        tiene a mano, elija el cliente y siga: el caso se registra igual.
      </p>
      <RegistroCaso cuentaInicial={cuentaInicial} />
    </SeccionPanel>
  );
}
