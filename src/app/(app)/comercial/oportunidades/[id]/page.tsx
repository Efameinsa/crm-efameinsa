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
import { AccionNuevoInforme, ListaInformesCierre, TablaComprasAnteriores } from "@/components/crm/secciones-cliente";
import { ContactosEditables } from "@/components/crm/contactos-editables";
import { IdentidadCuenta } from "@/components/crm/identidad-cuenta";
import { EtapaBadge } from "@/components/crm/etapa-badge";
import { fechaAgendada, fechaHoraLima } from "@/lib/fechas";
import { SolicitudLead } from "@/components/crm/solicitud-lead";
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

export default async function OportunidadDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ editar?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const supabase = await createClient();

  const [{ data: oportunidad }, { data: motivos }, { data: productos }, { data: cotizaciones }, { data: resultados }] =
    await Promise.all([
      supabase
        .from("oportunidades")
        .select(
          "id, etapa, intencion, monto_estimado, moneda, segmento, proxima_accion, proxima_accion_at, proxima_accion_hora, leads(codigo, canal, mensaje, utm_campaign, recibido_at), cuentas(id, razon_social, tipo_doc, num_doc, direccion, contactos(nombre, cargo, telefono, email, es_principal))",
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
        .select(
          "id, codigo, serie, estado, estado_aprobacion, total, moneda, nota_gerencia, condiciones, vigencia_dias, enviada_at, created_at, entrega_lugar",
        )
        .eq("oportunidad_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("catalogo_resultados_gestion").select("id, codigo, nombre, accion_sugerida, dias_sugeridos, efecto").eq("activo", true).order("id"),
    ]);

  if (!oportunidad) notFound();

  const lead = oportunidad.leads as unknown as {
    codigo: string | null;
    canal: string;
    mensaje: string | null;
    utm_campaign: string | null;
    recibido_at: string | null;
  } | null;

  const cuenta = oportunidad.cuentas as unknown as {
    id: string;
    razon_social: string;
    tipo_doc: TipoDocumento;
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

  // Lo que el cotizador necesita de cada equipo para que el comercial pueda
  // CONFIRMAR que eligió el correcto antes de agregarlo: foto, datos de placa y
  // las primeras características. No la ficha entera — mandar los 65 objetos
  // completos al navegador engordaría la página para nada, y con la foto y tres
  // viñetas ya se reconoce el equipo.
  //
  // El aviso de "sin ficha" existe porque el 24-08 Brenda cotizó a un cliente
  // real un equipo sin datos técnicos (LG TITAN-18) y se enteró recién al abrir
  // el PDF, cuando la página de la ficha salió vacía.
  const productosCotizador = (productos ?? []).map((pr) => {
    const ficha = pr.ficha as Record<string, unknown> | null;
    const lista = (clave: string) =>
      Array.isArray(ficha?.[clave]) ? (ficha![clave] as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const texto = (clave: string) => (typeof ficha?.[clave] === "string" && ficha[clave] ? (ficha[clave] as string) : null);
    const caracteristicas = lista("caracteristicas");
    return {
      id: pr.id,
      sku: pr.sku,
      marca: pr.marca,
      modelo: pr.modelo,
      nombre: pr.nombre,
      capacidad: pr.capacidad,
      segmento: pr.segmento,
      precios_producto: pr.precios_producto,
      // "secadora eléctrica" es como la piden los clientes, pero esa palabra
      // solo vive acá dentro, no en el nombre del equipo.
      calentamiento: texto("calentamiento"),
      panel: texto("panel"),
      controles: texto("controles"),
      fotoPath: pr.foto_path,
      // Tres bastan para reconocerlo; el resto va en el PDF.
      primerasCaracteristicas: caracteristicas.slice(0, 3),
      nCaracteristicas: caracteristicas.length,
      nDimensiones: lista("dimensiones").length + lista("medidas").length,
      sinFicha: caracteristicas.length + lista("dimensiones").length + lista("medidas").length === 0,
      sinFoto: !pr.foto_path,
    };
  });

  // ?editar=<id> → el cotizador corrige ese borrador en vez de crear uno nuevo.
  // Se exige que sea de ESTA oportunidad y que siga sin enviarse: una vez que
  // el documento salió al cliente, no se toca (migración 0062). La base lo
  // vuelve a comprobar; acá es para no ofrecer una pantalla que va a fallar.
  const borrador = (cotizaciones ?? []).find(
    (c) => c.id === sp.editar && c.estado === "borrador" && !c.enviada_at,
  );
  const { data: itemsBorrador } = borrador
    ? await supabase
        .from("cotizacion_items")
        .select("producto_id, descripcion, cantidad, precio_unitario, precio_lista, productos(marca, modelo, nombre)")
        .eq("cotizacion_id", borrador.id)
    : { data: null };

  const edicion = borrador
    ? {
        cotizacionId: borrador.id,
        codigo: borrador.codigo,
        serie: borrador.serie as "EFAMEINSA" | "OPEN",
        condiciones: borrador.condiciones,
        vigenciaDias: borrador.vigencia_dias,
        entregaLugar: borrador.entrega_lugar,
        items: (itemsBorrador ?? []).map((i) => {
          const pr = i.productos as unknown as { marca: string; modelo: string; nombre: string } | null;
          return {
            producto_id: i.producto_id,
            descripcion: i.descripcion,
            nombre: pr ? `${pr.marca} ${pr.modelo} — ${pr.nombre}` : (i.descripcion ?? "Equipo sin nombre"),
            cantidad: i.cantidad,
            precio_unitario: Number(i.precio_unitario),
            precioPiso: i.precio_lista != null ? Number(i.precio_lista) : null,
          };
        }),
      }
    : undefined;

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
          {/* LO PRIMERO, antes de registrar nada: qué pidió este prospecto.
              Va arriba de todo porque es lo que el comercial necesita leer
              antes de levantar el teléfono. Pedido de Brenda el 24-08: «cada
              nuevo prospecto tiene diferente interés de compra». */}
          {lead && (
            <SeccionPanel titulo="Solicitud del prospecto">
              <SolicitudLead mensaje={lead.mensaje} campania={lead.utm_campaign} compacto />
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

          <SeccionPanel titulo="Cotizaciones" id="cotizador">
            <div className="space-y-4">
              <ListaCotizaciones cotizaciones={cotizaciones ?? []} />
              {(cotizaciones?.length ?? 0) > 0 && <div className="border-t border-border" />}
              <Cotizador
                oportunidadId={oportunidad.id}
                productos={productosCotizador}
                historialPrecios={historialPrecios}
                edicion={edicion}
              />
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

              <SeccionPlegable titulo="Cliente y contactos" cantidad={contactosCuenta.length}>
                {/* Editables: es lo que se imprime en la cotización. El RUC y la
                    razón social van en el bloque del cliente; el contacto
                    principal, en el "Atención:" con su teléfono y correo. */}
                {cuenta?.id && (
                  <>
                    <div className="mb-3">
                      <IdentidadCuenta
                        cuentaId={cuenta.id}
                        tipoDoc={cuenta.tipo_doc}
                        numDoc={cuenta.num_doc}
                        razonSocial={cuenta.razon_social}
                      />
                    </div>
                    <ContactosEditables cuentaId={cuenta.id} contactos={contactosCuenta} />
                  </>
                )}
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
