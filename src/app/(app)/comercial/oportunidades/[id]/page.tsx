import { notFound } from "next/navigation";
import { Phone, Mail, MapPin, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cargarHistorialCuenta } from "@/lib/historial-cuenta";
import { RegistroRapido } from "@/components/crm/registro-rapido";
import { CambiarEtapa } from "@/components/crm/cambiar-etapa";
import { Cotizador } from "@/components/crm/cotizador";
import { ListaCotizaciones } from "@/components/crm/lista-cotizaciones";
import { CalificacionOportunidad } from "@/components/crm/calificacion-oportunidad";
import { HistorialCuenta } from "@/components/crm/historial-cuenta";
import { PuntoInteres } from "@/components/crm/punto-interes";
import { SeccionPanel, SeccionPlegable } from "@/components/crm/seccion-panel";
import { AccionNuevoInforme, ListaInformesCierre, TablaComprasAnteriores, ListaContactos } from "@/components/crm/secciones-cliente";
import { EtapaBadge } from "@/components/crm/etapa-badge";
import { fechaAgendada } from "@/lib/fechas";

export default async function OportunidadDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: oportunidad }, { data: motivos }, { data: productos }, { data: cotizaciones }, { data: resultados }] =
    await Promise.all([
      supabase
        .from("oportunidades")
        .select(
          "id, etapa, intencion, monto_estimado, moneda, segmento, proxima_accion, proxima_accion_at, proxima_accion_hora, cuentas(id, razon_social, tipo_doc, num_doc, direccion, contactos(nombre, cargo, telefono, email, es_principal))",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase.from("catalogo_motivos_rechazo").select("id, nombre").eq("activo", true).order("nombre"),
      supabase
        .from("productos")
        .select("id, sku, marca, modelo, nombre, capacidad, segmento, ficha, foto_path, precios_producto(tier, precio)")
        .eq("activo", true)
        .order("marca"),
      supabase
        .from("cotizaciones")
        .select("id, codigo, serie, estado, estado_aprobacion, total, moneda, nota_gerencia")
        .eq("oportunidad_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("catalogo_resultados_gestion").select("id, codigo, nombre, accion_sugerida, dias_sugeridos, efecto").eq("activo", true).order("id"),
    ]);

  if (!oportunidad) notFound();

  const cuenta = oportunidad.cuentas as unknown as {
    id: string;
    razon_social: string;
    tipo_doc: string;
    num_doc: string | null;
    direccion: string | null;
    contactos: { nombre: string; cargo: string | null; telefono: string | null; email: string | null }[];
  } | null;

  // Precio histórico por producto A ESTA CUENTA (último precio de venta,
  // sea cual sea la oportunidad en la que se cerró) — el cotizador lo usa
  // para avisar si se está regalando margen frente a lo que ya pagó antes.
  const historialPrecios: Record<string, { precio: number; fecha: string }> = {};
  if (cuenta?.id) {
    const { data: opsCuenta } = await supabase.from("oportunidades").select("id").eq("cuenta_id", cuenta.id);
    const opIdsCuenta = (opsCuenta ?? []).map((o) => o.id);
    if (opIdsCuenta.length > 0) {
      const { data: ventasCuenta } = await supabase
        .from("ventas")
        .select("fecha_venta, cotizaciones(cotizacion_items(producto_id, precio_unitario))")
        .in("oportunidad_id", opIdsCuenta)
        .order("fecha_venta", { ascending: false });
      for (const v of ventasCuenta ?? []) {
        const items =
          (v.cotizaciones as unknown as { cotizacion_items: { producto_id: string; precio_unitario: number }[] } | null)
            ?.cotizacion_items ?? [];
        for (const it of items) {
          if (!(it.producto_id in historialPrecios)) {
            historialPrecios[it.producto_id] = { precio: it.precio_unitario, fecha: v.fecha_venta };
          }
        }
      }
    }
  }

  // El cotizador solo necesita SABER si el equipo tiene ficha técnica, no la
  // ficha entera: mandarle los 65 objetos completos al navegador engordaría la
  // página para nada. El aviso existe porque el 24-08 Brenda cotizó a un cliente
  // real un equipo sin datos técnicos (LG TITAN-18) y se enteró recién al abrir
  // el PDF, cuando la página de la ficha salió vacía.
  const productosCotizador = (productos ?? []).map((pr) => {
    const ficha = pr.ficha as Record<string, unknown> | null;
    const largo = (clave: string) => (Array.isArray(ficha?.[clave]) ? (ficha![clave] as unknown[]).length : 0);
    return {
      id: pr.id,
      sku: pr.sku,
      marca: pr.marca,
      modelo: pr.modelo,
      nombre: pr.nombre,
      capacidad: pr.capacidad,
      segmento: pr.segmento,
      precios_producto: pr.precios_producto,
      sinFicha: largo("caracteristicas") + largo("dimensiones") + largo("medidas") === 0,
      sinFoto: !pr.foto_path,
    };
  });

  // El feed de "contexto primero": la historia COMPLETA del cliente (todas
  // sus oportunidades), no solo la de esta oportunidad puntual. `ventasConDetalle`
  // ya venía en el mismo viaje y antes se descartaba; ahora alimenta la sección
  // "Compras anteriores" que se trajo desde la ficha del cliente (C5).
  const { eventos, ventasConDetalle } = cuenta?.id
    ? await cargarHistorialCuenta(supabase, cuenta.id)
    : { eventos: [], ventasConDetalle: [] };

  // Informes de cierre y contactos completos del cliente: las otras dos
  // secciones que vivían solo en "Ver ficha completa".
  const { data: informes } = cuenta?.id
    ? await supabase
        .from("informes_cierre")
        .select("id, codigo, serie, fecha, monto_total, moneda, emitido_at")
        .eq("cuenta_id", cuenta.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const { data: contactosData } = cuenta?.id
    ? await supabase
        .from("contactos")
        .select("id, nombre, cargo, telefono, email, documento, es_principal")
        .eq("cuenta_id", cuenta.id)
        .order("es_principal", { ascending: false })
    : { data: [] };
  const contactosCuenta = contactosData ?? [];

  return (
    <div className="space-y-4">
      {/* Encabezado: identidad de la cuenta + estado, siempre visible arriba */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">{cuenta?.razon_social ?? "Cuenta sin nombre"}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {cuenta?.tipo_doc !== "SIN_DOC" && (
                <span className="inline-flex items-center gap-1">
                  <FileText className="size-3.5" />
                  {cuenta?.tipo_doc}: {cuenta?.num_doc}
                </span>
              )}
              {cuenta?.direccion && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {cuenta.direccion}
                </span>
              )}
              <PuntoInteres intencion={oportunidad.intencion} />
            </div>
          </div>
          <EtapaBadge etapa={oportunidad.etapa} />
        </div>

        {cuenta?.contactos && cuenta.contactos.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
            {cuenta.contactos.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-3">
                <span className="font-medium text-foreground">
                  {c.nombre}
                  {c.cargo ? ` (${c.cargo})` : ""}
                </span>
                {c.telefono && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="size-3.5" />
                    {c.telefono}
                  </span>
                )}
                {c.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="size-3.5" />
                    {c.email}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SeccionPanel titulo="Registrar gestión">
            <RegistroRapido oportunidadId={oportunidad.id} resultados={resultados ?? []} motivos={motivos ?? []} />
          </SeccionPanel>

          {cuenta?.id && (
            <SeccionPanel titulo="Historial del cliente">
              <HistorialCuenta eventos={eventos} oportunidadActualId={oportunidad.id} />
            </SeccionPanel>
          )}

          <SeccionPanel titulo="Cotizaciones">
            <div className="space-y-4">
              <ListaCotizaciones cotizaciones={cotizaciones ?? []} />
              {(cotizaciones?.length ?? 0) > 0 && <div className="border-t border-border" />}
              <Cotizador oportunidadId={oportunidad.id} productos={productosCotizador} historialPrecios={historialPrecios} />
            </div>
          </SeccionPanel>

          {/* C5 (plan 11): lo que antes obligaba a irse a "Ver ficha completa"
              —que tenía MENOS cosas que esta pantalla y por eso confundía—
              ahora vive acá, plegado. Cerrar una venta ya no exige cambiar de
              página: el informe para Central se crea desde este mismo sitio. */}
          {cuenta?.id && (
            <>
              <SeccionPlegable
                titulo="Informes de cierre"
                cantidad={(informes ?? []).length}
                accion={<AccionNuevoInforme cuentaId={cuenta.id} />}
              >
                <ListaInformesCierre informes={informes ?? []} />
              </SeccionPlegable>

              {ventasConDetalle.length > 0 && (
                <SeccionPlegable titulo="Compras anteriores" cantidad={ventasConDetalle.length}>
                  <TablaComprasAnteriores ventas={ventasConDetalle} />
                </SeccionPlegable>
              )}

              <SeccionPlegable titulo="Contactos" cantidad={contactosCuenta.length}>
                <ListaContactos contactos={contactosCuenta} />
              </SeccionPlegable>
            </>
          )}
        </div>

        <div className="space-y-4">
          <SeccionPanel titulo="Próxima acción">
            {oportunidad.proxima_accion ? (
              <div>
                <p className="text-sm text-foreground">{oportunidad.proxima_accion}</p>
                {/* proxima_accion_at es columna `date`: pasarla por new Date()
                    la leía como medianoche UTC y en Lima mostraba el día
                    anterior (A5 del plan 11). */}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {oportunidad.proxima_accion_at
                    ? fechaAgendada(oportunidad.proxima_accion_at, oportunidad.proxima_accion_hora)
                    : "Sin fecha"}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin próxima acción definida.</p>
            )}
          </SeccionPanel>

          <SeccionPanel titulo="Calificación">
            <CalificacionOportunidad
              oportunidadId={oportunidad.id}
              intencionInicial={oportunidad.intencion}
              montoInicial={oportunidad.monto_estimado}
              monedaInicial={oportunidad.moneda}
              segmentoInicial={oportunidad.segmento}
            />
          </SeccionPanel>

          <SeccionPanel titulo="Etapa">
            <CambiarEtapa oportunidadId={oportunidad.id} etapaActual={oportunidad.etapa} motivos={motivos ?? []} />
          </SeccionPanel>
        </div>
      </div>
    </div>
  );
}
