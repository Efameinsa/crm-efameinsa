import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { RegistroCaso } from "@/components/crm/registro-caso";

export const dynamic = "force-dynamic";

/**
 * Registrar un caso técnico, en la pantalla donde se atiende la llamada.
 *
 * Existe porque el teléfono del área ya no pasa por Central: «las llamadas van
 * a ir para Hever, directamente» (Ariana, 27-08). Lo que Central deriva sigue
 * llegando como antes; esto es para el cliente que llama y cuenta que su
 * lavadora no lava.
 */
export default function NuevoCasoPage() {
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
        el último mantenimiento, y ya se sabe si esto se cobra antes de terminar de escuchar el problema.
      </p>
      <RegistroCaso />
    </SeccionPanel>
  );
}
