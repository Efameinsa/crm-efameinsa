import { Phone, Mail, MapPin, FileText, CalendarClock } from "lucide-react";
import { RegistroNoDisponible } from "@/components/crm/registro-no-disponible";
import { createClient } from "@/lib/supabase/server";
import { cargarHistorialCuenta } from "@/lib/historial-cuenta";
import { RegistroRapido } from "@/components/crm/registro-rapido";
import { CambiarEtapa } from "@/components/crm/cambiar-etapa";
import { ListaCotizaciones } from "@/components/crm/lista-cotizaciones";
import { CalificacionOportunidad } from "@/components/crm/calificacion-oportunidad";
import { HistorialCuenta } from "@/components/crm/historial-cuenta";
import { PuntoInteres } from "@/components/crm/punto-interes";
import { SeccionPanel, SeccionPlegable } from "@/components/crm/seccion-panel";
import { AccionNuevoInforme, ListaInformesCierre, TablaComprasAnteriores } from "@/components/crm/secciones-cliente";
import { ContactosEditables } from "@/components/crm/contactos-editables";
import { IdentidadCuenta } from "@/components/crm/identidad-cuenta";
import { EtapaBadge } from "@/components/crm/etapa-badge";
import { fechaAgendada, fechaHoraLima } from "@/lib/fechas";
import { SolicitudLead } from "@/components/crm/solicitud-lead";
import { AdjuntosLead } from "@/components/crm/adjuntos-lead";
import { firmarAdjuntosDeLeads } from "@/lib/adjuntos-lead";
import type { AdjuntoLead } from "@/lib/validaciones/lead";
import type { TipoDocumento } from "@/lib/documento";

// Mismo vocabulario que usa Central en su bandeja, para que el comercial lea
// el mismo nombre de canal que vio quien se lo derivó.
const ETIQUETA_CANAL_LEAD: Record<string, string> = {
  whatsapp: "WhatsApp",
  llamada: "llamada",
  formulario_web: "el formulario de la web",
  facebook: "Facebook",
  instagram: "Instagram",
  email: "correo",
  presencial: "visita presencial",
  referido: "referido",
  otro: "otro canal",
};

export default async function OportunidadDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: oportunidad }, { data: motivos }, { data: cotizaciones }, { data: resultados }] =
    await Promise.all([
      supabase
        .from("oportunidades")
        .select(
          "id, etapa, intencion, monto_estimado, moneda, segmento, proxima_accion, proxima_accion_at, proxima_accion_hora, leads(codigo, canal, mensaje, adjuntos, utm_campaign, recibido_at), cuentas(id, razon_social, tipo_doc, num_doc, direccion, contactos(nombre, cargo, telefono, email, es_principal))",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase.from("catalogo_motivos_rechazo").select("id, nombre").eq("activo", true).order("nombre"),
      supabase
        .from("cotizaciones")
        .select(
          "id, codigo, serie, estado, estado_aprobacion, total, moneda, nota_gerencia, condiciones, vigencia_dias, enviada_at, created_at, entrega_lugar",
        )
        .eq("oportunidad_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("catalogo_resultados_gestion").select("id, codigo, nombre, accion_sugerida, dias_sugeridos, efecto").eq("activo", true).order("id"),
    ]);

  if (!oportunidad) {
    return <RegistroNoDisponible volverHref="/comercial/mi-gestion" volverTexto="Volver a mi gestión" />;
  }

  const lead = oportunidad.leads as unknown as {
    codigo: string | null;
    canal: string;
    mensaje: string | null;
    adjuntos: AdjuntoLead[] | null;
    utm_campaign: string | null;
    recibido_at: string | null;
  } | null;

  // La foto o el PDF que el prospecto mandó por WhatsApp y Central adjuntó al
  // registrar (25-08): el comercial la ve junto a la solicitud, sin pedirla.
  const adjuntosLead = lead?.adjuntos?.length
    ? ((await firmarAdjuntosDeLeads(supabase, [{ id: "lead", adjuntos: lead.adjuntos }])).get("lead") ?? [])
    : [];

  const cuenta = oportunidad.cuentas as unknown as {
    id: string;
    razon_social: string;
    tipo_doc: TipoDocumento;
    num_doc: string | null;
    direccion: string | null;
    contactos: { nombre: string; cargo: string | null; telefono: string | null; email: string | null }[];
  } | null;

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
        .select("id, nombre, cargo, telefono, email, documento, direccion, es_principal")
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

            {/* La próxima acción es ESTADO, no un panel: se escribe en
                «Registrar gestión» —treinta centímetros a la izquierda— y ya se
                repite en Mi día, Mi agenda y la tabla de oportunidades. Ocupaba
                la cabecera de la columna derecha, que es el sitio de las cosas
                que se HACEN. Acá dice lo mismo en una línea y, cuando falta,
                deja de ser un texto gris que nadie mira: una oportunidad sin
                siguiente paso es justo lo que mide la supervisión diaria. */}
            {oportunidad.proxima_accion ? (
              <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 text-xs text-foreground">
                <CalendarClock className="size-3.5 text-muted-foreground" />
                <span className="font-medium">{oportunidad.proxima_accion}</span>
                {/* proxima_accion_at es columna `date`: pasarla por new Date()
                    la leía como medianoche UTC y en Lima mostraba el día
                    anterior (A5 del plan 11). */}
                <span className="text-muted-foreground">
                  ·{" "}
                  {oportunidad.proxima_accion_at
                    ? fechaAgendada(oportunidad.proxima_accion_at, oportunidad.proxima_accion_hora)
                    : "sin fecha"}
                </span>
              </p>
            ) : (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-800">
                <CalendarClock className="size-3.5" />
                Sin próxima acción — agéndela al registrar la gestión
              </p>
            )}
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

        {/* Corregir lo que se acaba de leer, sin viajar al fondo de la página
            (pedido 25-08): el RUC, la razón social y los contactos se editan
            acá mismo, plegados para no estorbar la lectura. */}
        {cuenta?.id && (
          <details className="group mt-3 border-t border-border pt-2">
            <summary className="cursor-pointer list-none text-xs font-medium text-primary hover:underline [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Corregir datos del cliente y contactos ▾</span>
              <span className="hidden group-open:inline">Cerrar edición ▴</span>
            </summary>
            <div className="mt-3 space-y-3">
              <IdentidadCuenta
                cuentaId={cuenta.id}
                tipoDoc={cuenta.tipo_doc}
                numDoc={cuenta.num_doc}
                razonSocial={cuenta.razon_social}
              />
              <ContactosEditables cuentaId={cuenta.id} contactos={contactosCuenta} />
            </div>
          </details>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* LO PRIMERO, antes de registrar nada: qué pidió este prospecto.
              Va arriba de todo porque es lo que el comercial necesita leer
              antes de levantar el teléfono. Pedido de Brenda el 24-08: «cada
              nuevo prospecto tiene diferente interés de compra». */}
          {lead && (
            <SeccionPanel titulo="Solicitud del prospecto">
              <SolicitudLead mensaje={lead.mensaje} campania={lead.utm_campaign} compacto />
              <AdjuntosLead adjuntos={adjuntosLead} />
              <p className="mt-2 text-[11px] text-muted-foreground">
                Entró por {ETIQUETA_CANAL_LEAD[lead.canal] ?? lead.canal}
                {lead.recibido_at ? ` · ${fechaHoraLima(lead.recibido_at)}` : ""}
                {lead.codigo ? ` · ${lead.codigo}` : ""}
              </p>
            </SeccionPanel>
          )}

          <SeccionPanel titulo="Registrar gestión">
            <RegistroRapido oportunidadId={oportunidad.id} resultados={resultados ?? []} motivos={motivos ?? []} />
          </SeccionPanel>

          {cuenta?.id && (
            <SeccionPanel titulo="Historial del cliente">
              <HistorialCuenta eventos={eventos} oportunidadActualId={oportunidad.id} />
            </SeccionPanel>
          )}

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

            </>
          )}
        </div>

        <div className="space-y-4">
          {/* PRIMERO, arriba de todo (27-08). La columna derecha es el riel de
              acciones y cotizar es la que pesa: es por lo que el comercial
              entra a esta pantalla. Calificación y Etapa se tocan una vez cada
              tanto, así que bajan. Armar el documento ya no vive acá — se abre
              `/cotizar`, una pantalla entera para eso; lo que queda es el
              estado de lo cotizado y el botón para empezar. */}
          <SeccionPanel titulo="Cotizaciones" id="cotizador">
            <ListaCotizaciones cotizaciones={cotizaciones ?? []} oportunidadId={oportunidad.id} />
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
