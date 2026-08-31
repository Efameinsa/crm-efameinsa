import { Phone, Mail, MapPin, FileText, CalendarClock } from "lucide-react";
import { RegistroNoDisponible } from "@/components/crm/registro-no-disponible";
import { createClient } from "@/lib/supabase/server";
import { cargarHistorialCuenta } from "@/lib/historial-cuenta";
import { RegistroRapido } from "@/components/crm/registro-rapido";
import { PideServicioBoton } from "@/components/crm/pide-servicio-boton";
import { CambiarEtapa } from "@/components/crm/cambiar-etapa";
import { ListaCotizaciones } from "@/components/crm/lista-cotizaciones";
import { CalificacionOportunidad } from "@/components/crm/calificacion-oportunidad";
import { HistorialCuenta } from "@/components/crm/historial-cuenta";
import { EquiposDelCliente } from "@/components/crm/equipos-del-cliente";
import { PuntoInteres } from "@/components/crm/punto-interes";
import { SeccionPanel, SeccionPlegable } from "@/components/crm/seccion-panel";
import { AccionNuevoInforme, ListaInformesCierre, TablaComprasAnteriores } from "@/components/crm/secciones-cliente";
import { firmarAdjuntosDeCierres } from "@/lib/adjuntos-cierre";
import { ContactosEditables } from "@/components/crm/contactos-editables";
import { IdentidadCuenta } from "@/components/crm/identidad-cuenta";
import { EtapaBadge } from "@/components/crm/etapa-badge";
import { TrabajarHistoricaBoton } from "@/components/crm/trabajar-historica-boton";
import { fechaAgendada, fechaHoraLima } from "@/lib/fechas";
import { SolicitudLead } from "@/components/crm/solicitud-lead";
import { AdjuntosLead } from "@/components/crm/adjuntos-lead";
import { RutaDerivacion, type Hito } from "@/components/crm/ruta-derivacion";
import { demora, haceCuanto, ETIQUETA_MOTIVO } from "@/lib/derivados-central";
import { ETIQUETA_ACTIVIDAD } from "@/components/crm/etiquetas-actividad";
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

// Un día sin tocar un contacto que ya le derivaron es tarde: el mismo umbral
// con el que Central marca la demora en su bandeja. Vive fuera del componente
// porque mirar el reloj no es algo que se pueda hacer durante el render.
function llevaDemasiadoSinGestion(asignadoAt: string | null): boolean {
  if (!asignadoAt) return false;
  return Date.now() - new Date(asignadoAt).getTime() > 864e5;
}

export default async function OportunidadDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: oportunidad }, { data: motivos }, { data: cotizaciones }, { data: resultados }] =
    await Promise.all([
      supabase
        .from("oportunidades")
        .select(
          "id, etapa, intencion, monto_estimado, moneda, segmento, proxima_accion, proxima_accion_at, proxima_accion_hora, lead_id, created_at, leads(codigo, canal, mensaje, adjuntos, utm_campaign, recibido_at), cuentas(id, razon_social, tipo_doc, num_doc, direccion, contactos(nombre, cargo, telefono, email, es_principal))",
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
        .select("id, codigo, serie, fecha, monto_total, moneda, emitido_at, adjuntos")
        .eq("cuenta_id", cuenta.id)
        .order("created_at", { ascending: false })
    : { data: [] };
  const adjuntosPorInforme = await firmarAdjuntosDeCierres(supabase, informes ?? []);

  const { data: contactosData } = cuenta?.id
    ? await supabase
        .from("contactos")
        .select("id, nombre, cargo, telefono, email, documento, direccion, es_principal")
        .eq("cuenta_id", cuenta.id)
        .order("es_principal", { ascending: false })
    : { data: [] };
  const contactosCuenta = contactosData ?? [];

  // ── La ruta del contacto, desde antes de que fuera suyo ──────────────────
  //
  // Central ya la tenía y el comercial no: su línea de tiempo arrancaba en su
  // primera gestión, así que el reloj con el que se lo mide era invisible del
  // lado de quien tiene que correrlo. Carlos lo pidió textual el 27-08 mirando
  // la pantalla de Ariana —«pero comienza desde su gestión, no comienza desde
  // el inicio, que es cuando te lo entregaron»— porque es la base de la
  // medición y de la reasignación: «te lo derivé a las 2:05 y no has hecho
  // absolutamente nada».
  //
  // No se inventa ningún dato: son los mismos tres hitos que Central ve, con
  // el mismo componente. Lo único nuevo es quién los mira.
  const [{ data: asignacion }, { data: primeraGestion }] = await Promise.all([
    oportunidad.lead_id
      ? supabase
          .from("asignaciones")
          .select("motivo, decidida_por, created_at")
          .eq("lead_id", oportunidad.lead_id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("actividades")
      .select("tipo, realizada_at")
      .eq("oportunidad_id", id)
      .order("realizada_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const { data: quienDerivo } = asignacion?.decidida_por
    ? await supabase.from("perfiles").select("nombre").eq("id", asignacion.decidida_por).maybeSingle()
    : { data: null };

  // Cuándo pasó a ser suya: la asignación si la hay, y si no la creación de la
  // oportunidad, que es el instante en que apareció en su lista.
  const asignadoAt = asignacion?.created_at ?? oportunidad.created_at ?? null;
  const sinGestion = !primeraGestion;

  const rutaDelContacto: Hito[] = [
    {
      titulo: "Llegó a Central",
      fecha: lead?.recibido_at ?? null,
      detalle: lead ? (ETIQUETA_CANAL_LEAD[lead.canal] ?? lead.canal) : null,
      pendiente: "Sin registro de ingreso",
    },
    {
      titulo: "Se lo derivaron a usted",
      fecha: asignadoAt,
      demora: demora(lead?.recibido_at ?? null, asignadoAt),
      detalle: [
        quienDerivo?.nombre ? `por ${quienDerivo.nombre}` : null,
        asignacion?.motivo ? (ETIQUETA_MOTIVO[asignacion.motivo] ?? asignacion.motivo) : null,
      ]
        .filter(Boolean)
        .join(" · "),
      pendiente: "Sin derivar",
    },
    {
      titulo: "Su primer contacto",
      fecha: primeraGestion?.realizada_at ?? null,
      demora: demora(asignadoAt, primeraGestion?.realizada_at ?? null),
      detalle: primeraGestion ? (ETIQUETA_ACTIVIDAD[primeraGestion.tipo] ?? primeraGestion.tipo) : null,
      pendiente: asignadoAt
        ? `Todavía sin gestión registrada — se lo derivaron ${haceCuanto(asignadoAt)}`
        : "Todavía sin gestión registrada",
      alerta: sinGestion && llevaDemasiadoSinGestion(asignadoAt),
    },
  ];

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

          {/* Antes de registrar nada: el reloj que ya viene corriendo. Va
              arriba de «Registrar gestión» a propósito — es la pantalla donde
              se destraba, no solo donde se mira. Solo para lo que entró por
              Central: las oportunidades importadas del Excel no tuvieron
              derivación y mostrarles una ruta vacía sería ruido. */}
          {lead && (
            <SeccionPanel titulo="Cómo llegó este contacto">
              <RutaDerivacion hitos={rutaDelContacto} />
            </SeccionPanel>
          )}

          <SeccionPanel titulo="Registrar gestión">
            <RegistroRapido oportunidadId={oportunidad.id} resultados={resultados ?? []} motivos={motivos ?? []} />
            {/* Justo debajo de donde se anota la llamada, porque es ahí donde
                se descubre: el 29-08 Brenda escribió «no desea equipos… desea
                mmto, repuestos, se le indicó que se va a derivar con
                postventa» y no tenía dónde apretar para que eso ocurriera.
                Central no lee las notas de gestión. */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <PideServicioBoton oportunidadId={oportunidad.id} />
              <span className="text-[11px] text-muted-foreground">
                Si al llamar resulta que no quiere equipos: quiere mantenimiento, repuestos o tiene una garantía.
              </span>
            </div>
          </SeccionPanel>

          {/* EL PARQUE INSTALADO, ANTES DEL HISTORIAL DE GESTIÓN. Cuando el
              caso es de postventa, la primera pregunta no es qué se habló sino
              si la máquina está en garantía: es lo que decide si el servicio se
              cobra. El ing. Carlos lo pidió el 31-08 abriendo un caso de
              Casandina —«acá tendría que aparecer si está en garantía o no»— y
              enseguida «te falta servirle para que salga el historial del
              cliente, cuándo le pusimos en marcha». */}
          {cuenta?.id && <EquiposDelCliente cuentaId={cuenta.id} />}

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
                <ListaInformesCierre informes={informes ?? []} adjuntosPorInforme={adjuntosPorInforme} />
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
            {/* Si viene del archivo de los Excel (0130), lo primero no es
                elegir etapa a mano: es decidir si se retoma. El botón la
                devuelve a seguimiento con la próxima acción para hoy y deja
                escrito quién la sacó — el selector de abajo no dejaría rastro. */}
            {oportunidad.etapa === "historico" ? (
              <div className="space-y-3 rounded-md border border-dashed border-border p-4">
                <p className="text-xs text-muted-foreground">
                  Esta oportunidad está en el <span className="font-semibold text-foreground">histórico</span>: vino de
                  los Excel de agosto y nadie la retomó dentro del CRM, así que no cuenta como pendiente. Sigue siendo
                  suya y conserva todo su historial.
                </p>
                <TrabajarHistoricaBoton oportunidadId={oportunidad.id} />
              </div>
            ) : (
              <CambiarEtapa oportunidadId={oportunidad.id} etapaActual={oportunidad.etapa} motivos={motivos ?? []} />
            )}
          </SeccionPanel>
        </div>
      </div>
    </div>
  );
}
