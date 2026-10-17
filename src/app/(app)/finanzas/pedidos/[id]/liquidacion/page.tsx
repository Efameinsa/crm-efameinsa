import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { hoyLima } from "@/lib/periodo";
import { cargarBaseLiquidacion } from "@/lib/liquidacion-automatica";
import { EditorLiquidacion } from "@/components/crm/editor-liquidacion";

export const dynamic = "force-dynamic";

/**
 * GENERAR LA LIQUIDACIÓN (0534; reunión 17-10 gerencia + Jhon; Santos: «la
 * generación debería ser automática… y un editor de campos para ajustar»).
 * Pantalla propia: a la izquierda lo que el CRM ya trajo, editable; a la
 * derecha la hoja tal como va a salir, en vivo. Validar la guarda como la
 * N.º siguiente y avisa a Central.
 */
export default async function GenerarLiquidacionPage({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await requerirPerfil();
  const { id } = await params;
  const base = await cargarBaseLiquidacion(await createClient(), id, perfil.id);
  if (!base) notFound();
  return <EditorLiquidacion base={base} hoy={hoyLima()} />;
}
