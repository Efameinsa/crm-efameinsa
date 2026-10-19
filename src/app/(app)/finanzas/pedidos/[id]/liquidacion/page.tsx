import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { hoyLima } from "@/lib/periodo";
import { cargarBaseLiquidacion } from "@/lib/liquidacion-automatica";
import { unPedido } from "@/lib/pagos-finanzas";
import { cotizacionesDeCierres } from "@/lib/documentos-finanzas";
import { EditorLiquidacion } from "@/components/crm/editor-liquidacion";
import { ExpedienteCierre } from "@/components/crm/expediente-cierre";

export const dynamic = "force-dynamic";

/**
 * GENERAR LA LIQUIDACIÓN (0534; reunión 17-10 gerencia + Jhon; Santos: «la
 * generación debería ser automática… y un editor de campos para ajustar»).
 * Pantalla propia: a la izquierda lo que el CRM ya trajo, editable; a la
 * derecha la hoja tal como va a salir, en vivo. Validar la guarda como la
 * N.º siguiente y avisa a Central. Arriba, el «Expediente» del cierre
 * (voucher, OC, cotización) para validar sin salir (buzón Jhon 19-10).
 */
export default async function GenerarLiquidacionPage({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await requerirPerfil();
  const { id } = await params;
  const supabase = await createClient();
  const [base, p] = await Promise.all([cargarBaseLiquidacion(supabase, id, perfil.id), unPedido(supabase, id)]);
  if (!base) notFound();
  const cotizaciones = p?.informeId ? await cotizacionesDeCierres(supabase, [p.informeId]) : null;
  const expediente =
    p?.informeId && p.codigoCierre ? (
      <ExpedienteCierre
        informeId={p.informeId}
        codigo={p.codigoCierre}
        cliente={p.cliente}
        clienteDoc={p.clienteDoc}
        clienteCorreo={p.clienteCorreo}
        numeroOperacion={p.numeroOperacion}
        serie={p.serie ?? "EFAMEINSA"}
        monto={p.total ?? 0}
        moneda={p.moneda}
        modalidadPago={p.modalidadPago}
        entregaLugar={p.entregaLugar}
        entregaFecha={p.entregaFecha}
        adjuntos={p.adjuntos}
        compendio={null}
        cotizacion={cotizaciones?.get(p.informeId) ?? null}
        pedidoId={p.id}
        soloLectura
      />
    ) : null;
  return <EditorLiquidacion base={base} hoy={hoyLima()} expediente={expediente} />;
}
