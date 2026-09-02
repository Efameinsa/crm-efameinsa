import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { VistaCierre, type InformeVista, type ItemVista, type VersionVista } from "@/components/crm/vista-cierre";
import { firmarAdjuntosDeCierres, type AdjuntoCierre } from "@/lib/adjuntos-cierre";
import { cargarCompendio, oportunidadDelInforme } from "@/lib/compendio-cierre";
import type { ContactoInforme } from "@/lib/pdf/informe-cierre-pdf";

export const dynamic = "force-dynamic";

/**
 * El cierre de venta abierto como pantalla, no como PDF.
 *
 * Gerencia, Word de observaciones del 01.09, punto 3: «que permita ingresar al
 * cierre y ver el detalle, pero si requiere modificar algo debe solicitar
 * PIN». Hasta el 02-09 la fila de «Mis cierres» abría el PDF y el expediente
 * solo lo veía Central. La pantalla y el modo de corrección viven en
 * `VistaCierre`; la corrección con código, en la base (0153).
 *
 * RLS limita quién llega: el comercial ve los informes de SU cartera (0049);
 * gerencia, Central y operaciones ven todo. Si no es suyo, no existe para él.
 */
export default async function CierrePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  const { data: informe } = await supabase
    .from("informes_cierre")
    .select("*, perfiles!informes_cierre_creado_por_fkey(nombre, codigo_comercial)")
    .eq("id", id)
    .maybeSingle();
  if (!informe) notFound();

  const [adjuntosPorInforme, compendio, { data: versionesData }, { data: ventanaData }] = await Promise.all([
    firmarAdjuntosDeCierres(supabase, [{ id: informe.id, adjuntos: (informe.adjuntos ?? []) as AdjuntoCierre[] }]),
    cargarCompendio(await oportunidadDelInforme(informe)).catch(() => null),
    supabase
      .from("informes_cierre_versiones")
      .select("version, archivada_at, motivo, perfiles!informes_cierre_versiones_corregido_por_fkey(nombre)")
      .eq("informe_id", informe.id)
      .order("version", { ascending: false }),
    // La ventana viva de este usuario, si la hay (0154): un F5 a mitad de la
    // corrección no debe obligar a pedir otro código.
    supabase.rpc("correccion_informe_abierta", { p_informe: informe.id }),
  ]);
  const ventanaCruda = ventanaData as { expira_at: string; autorizo: string; motivo: string } | null;
  const correccionAbierta = ventanaCruda?.expira_at
    ? { expiraAt: ventanaCruda.expira_at, autorizo: ventanaCruda.autorizo, motivo: ventanaCruda.motivo }
    : null;

  const creadoPor = informe.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
  const contacto = (c: unknown): ContactoInforme => (c && typeof c === "object" ? (c as ContactoInforme) : {});

  const vista: InformeVista = {
    id: informe.id,
    codigo: informe.codigo,
    serie: informe.serie,
    fecha: informe.fecha,
    emitidoAt: informe.emitido_at,
    anuladoAt: informe.anulado_at,
    anuladoMotivo: informe.anulado_motivo,
    urgente: Boolean(informe.urgente),
    clienteNuevo: Boolean(informe.cliente_nuevo),
    cliente_nombre: informe.cliente_nombre,
    cliente_doc: informe.cliente_doc,
    cliente_direccion: informe.cliente_direccion,
    cliente_correo: informe.cliente_correo,
    referencia: informe.referencia,
    asunto: informe.asunto,
    presupuesto_ref: informe.presupuesto_ref,
    orden_compra: informe.orden_compra,
    modalidad_pago: (informe.modalidad_pago ?? []) as string[],
    forma_pago: informe.forma_pago,
    comprobante: informe.comprobante,
    nota_condiciones: informe.nota_condiciones,
    entrega_fecha: informe.entrega_fecha,
    entrega_hora: informe.entrega_hora,
    entrega_lugar: informe.entrega_lugar,
    entrega_direccion: informe.entrega_direccion,
    nota_despacho: informe.nota_despacho,
    contacto_venta: contacto(informe.contacto_venta),
    contacto_contabilidad: contacto(informe.contacto_contabilidad),
    contacto_despacho: contacto(informe.contacto_despacho),
    items: ((informe.items ?? []) as ItemVista[]).map((i) => ({
      descripcion: i.descripcion,
      cantidad: Number(i.cantidad),
      precio_unitario: Number(i.precio_unitario),
      bloque: i.bloque === "gratuito" ? "gratuito" : "venta",
    })),
    incluye: (informe.incluye ?? []) as string[],
    gratis: informe.gratis,
    garantia: informe.garantia,
    nota_final: informe.nota_final,
    moneda: informe.moneda,
    monto_total: Number(informe.monto_total),
    version: Number(informe.version ?? 1),
    corregidoAt: informe.corregido_at ?? null,
    creadoPor: creadoPor ? { nombre: creadoPor.nombre, codigo: creadoPor.codigo_comercial } : null,
  };

  const versiones: VersionVista[] = (versionesData ?? []).map((v) => ({
    version: Number(v.version),
    archivadaAt: v.archivada_at as string,
    motivo: v.motivo as string,
    corregidoPor: (v.perfiles as unknown as { nombre: string } | null)?.nombre ?? null,
  }));

  // Corrige quien emitió, o backoffice/central/operaciones; la base lo vuelve
  // a comprobar (0153). Acá solo decide si se ofrece el botón.
  const puedeCorregir =
    informe.emitido_at != null &&
    informe.anulado_at == null &&
    (informe.creado_por === perfil.id || ["central", "gerencia", "admin", "operaciones"].includes(perfil.rol));

  return (
    <div className="space-y-3">
      <Link
        href="/comercial/cierres"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Mis cierres
      </Link>
      <VistaCierre
        informe={vista}
        adjuntos={adjuntosPorInforme.get(informe.id) ?? []}
        compendio={compendio}
        versiones={versiones}
        puedeCorregir={puedeCorregir}
        correccionAbierta={correccionAbierta}
      />
    </div>
  );
}
