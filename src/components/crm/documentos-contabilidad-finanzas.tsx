import { FileCheck2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { agregarConstanciasDePago, documentosDeFinanzas } from "@/lib/documentos-finanzas";
import { DocumentosFinanzasLista } from "@/components/crm/documentos-finanzas-lista";
import { textoMotivoGuia } from "@/lib/postventa";
import { fechaHoraLima } from "@/lib/fechas";

/**
 * «DOCUMENTOS DEL EXPEDIENTE · CONTABILIDAD Y FINANZAS» (reunión de gerencia
 * 20-10, Beneficencia de Huancayo, con Brenda PV2 y Jhon).
 *
 * Postventa no veía si ya se había facturado («como postventa, ¿dónde vemos si
 * ya se facturó? No hay»), y por eso las cosas se pedían por correo. Gerencia:
 * «documento del expediente guión comercial, y abajo documento del expediente
 * guión contabilidad y finanzas… la guía, la factura, la nota de crédito… la
 * liquidación también… va a ver todo». Y las constancias de abono, para que
 * Central no dependa de que Finanzas se las imprima.
 *
 * Se lee con la llave de servicio porque las tablas de Finanzas tienen su RLS
 * cerrada (0306): esta sección solo se monta en pantallas que ya autorizaron
 * a quien mira el pedido.
 */
export async function DocumentosContabilidadFinanzas({
  servicio,
}: {
  servicio: {
    id: string;
    guia?: string | null;
    guia_motivo?: string | null;
    guia_motivo_detalle?: string | null;
    guia_confirmada_at?: string | null;
    guia_comprobante_tipo?: string | null;
    guia_comprobante_numero?: string | null;
    orden_facturar_at?: string | null;
    orden_facturar_atendida_at?: string | null;
    no_se_factura_motivo?: string | null;
  };
}) {
  const admin = createAdminClient();
  const mapa = await documentosDeFinanzas(admin, [servicio.id]);
  await agregarConstanciasDePago(admin, mapa, [servicio.id]);
  const docs = mapa.get(servicio.id);
  const motivo = textoMotivoGuia(servicio.guia_motivo ?? null, servicio.guia_motivo_detalle ?? null);
  const facturado = (docs?.facturas ?? []).some((f) => f.tipo === "factura" && !f.anuladaAt);

  return (
    <div id="documentos-finanzas" className="scroll-mt-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-[12px] font-bold uppercase tracking-wide text-foreground">Documentos del expediente · Contabilidad y Finanzas</h2>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        {facturado
          ? "Ya está facturado. Si el cliente pide la factura, está aquí."
          : servicio.no_se_factura_motivo
            ? `Finanzas indicó que no se factura: ${servicio.no_se_factura_motivo}.`
            : servicio.orden_facturar_atendida_at
              ? "Finanzas dio el OK para facturar: Facturación la emite y aparece aquí."
              : servicio.orden_facturar_at
                ? "Orden de facturar enviada: esperando el OK de Finanzas."
                : "Todavía sin factura."}
      </p>

      <div className="mt-3 rounded-md border border-border p-2.5 text-xs">
        <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          <FileCheck2 className="size-3.5" /> Guía de remisión
        </p>
        {servicio.guia_confirmada_at || servicio.guia ? (
          <p className="mt-1 text-foreground">
            {servicio.guia ? <b className="font-mono">{servicio.guia}</b> : "Número aún no anotado"}
            {motivo ? ` · ${motivo}` : ""}
            {servicio.guia_confirmada_at ? ` · Contabilidad la autorizó el ${fechaHoraLima(servicio.guia_confirmada_at)}` : ""}
            {servicio.guia_comprobante_numero ? ` · comprobante ${servicio.guia_comprobante_tipo ?? ""} ${servicio.guia_comprobante_numero}` : ""}
          </p>
        ) : (
          <p className="mt-1 text-muted-foreground">Contabilidad todavía no autoriza la guía.</p>
        )}
      </div>

      <div className="mt-3">
        <DocumentosFinanzasLista docs={docs ?? { liquidaciones: [], facturas: [], constancias: [] }} />
      </div>
    </div>
  );
}
