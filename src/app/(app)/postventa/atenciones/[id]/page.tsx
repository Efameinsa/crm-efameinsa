import { CambiarTipoAtencion } from "@/components/crm/cambiar-tipo-atencion";
import Link from "next/link";
import { ArrowLeft, Building2, Clock, FileText, Wrench, Package, PhoneCall } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AvisoMismoCliente } from "@/components/crm/aviso-mismo-cliente";
import { RegistroNoDisponible } from "@/components/crm/registro-no-disponible";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { LineaAtencion } from "@/components/crm/linea-atencion";
import { AperturaLlamadaBoton } from "@/components/crm/apertura-llamada-boton";
import { ETIQUETA_ESTADO_APERTURA, ETIQUETA_TIPO_APERTURA, estadoApertura, type AperturaLlamada } from "@/lib/aperturas-llamada";
import { tecnicosConocidos } from "@/lib/tecnicos";
import { FichasRelacionadas } from "@/components/crm/fichas-relacionadas";
import { candidatosMismoCliente } from "@/lib/acciones/cuentas";
import { cargarSupervisores } from "@/lib/supervisores";
import { ConQuienHablar } from "@/components/crm/con-quien-hablar";
import { EquiposDeLaAtencion } from "@/components/crm/equipos-de-la-atencion";
import { OtraMaquinaDelCaso } from "@/components/crm/otra-maquina-del-caso";
import { HistorialDelEquipo } from "@/components/crm/historial-del-equipo";
import { HistorialPostventaCliente } from "@/components/crm/historial-postventa-cliente";
import { requerirPerfil } from "@/lib/auth";
import { puedeVerPrecios } from "@/lib/postventa";
import { RutaDerivacion, type Hito } from "@/components/crm/ruta-derivacion";
import { ETIQUETA_ACTIVIDAD } from "@/components/crm/etiquetas-actividad";
import { demora, ETIQUETA_CANAL, ETIQUETA_MOTIVO } from "@/lib/derivados-central";
import { fechaHoraLima, fechaLima } from "@/lib/fechas";
import {
  ETIQUETA_TIPO_ATENCION,
  PISTA_DE_TIPO,
  relojAtencion,
  type Atencion,
} from "@/lib/atenciones";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * La ficha de una atención técnica.
 *
 * Contesta, en este orden: de quién es y qué máquina, en qué anda, y qué hay
 * que hacer ahora. Nada más — el historial de la máquina ya vive en su ficha de
 * equipo instalado y repetirlo acá solo alarga el scroll.
 */
export default async function AtencionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("atenciones")
    .select(
      "id, cuenta_id, equipo_id, cliente_texto, equipo_texto, tipo, clasificacion, etapa, en_garantia, hizo_preventivo, asignado_a, tecnico, solicitado_at, registrado_at, diagnosticado_at, programada_at, atendido_at, pruebas_at, conformidad_at, cerrado_at, seguimiento_at, seguimiento_nota, tomada_at, tomada_por, conformidad_nombre, informe_servicio_id, resultado, detalle, diagnostico, motivo_cierre, no_facturado_motivo, etapas_omitidas, garantia_omitida_at, garantia_omitida_motivo, trabajo_realizado, repuestos_usados, ciclos, pruebas_detalle, pruebas_conforme, oportunidad_id, servicio_id, servicios_postventa(id, equipo, despachado_at, fecha_despacho, puesta_en_marcha), cuentas(razon_social, num_doc), perfiles:asignado_a(nombre, codigo_comercial), tomadaPor:tomada_por(nombre, codigo_comercial), recibido_por, recibidoPor:recibido_por(nombre, codigo_comercial)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    return <RegistroNoDisponible volverHref="/postventa/atenciones" volverTexto="Volver a las atenciones" />;
  }
  const pedidoEnganchado = (data as unknown as { servicios_postventa: { id: string; equipo: string | null; despachado_at: string | null; fecha_despacho: string | null; puesta_en_marcha: string | null } | null }).servicios_postventa;

  const a = data as unknown as Atencion & {
    oportunidad_id: string | null;
    recibidoPor: { nombre: string; codigo_comercial: string | null } | null;
    cuentas: { razon_social: string; num_doc: string | null } | null;
    perfiles: { nombre: string; codigo_comercial: string | null } | null;
  };

  // Lo que el parque instalado ya sabe del equipo: es lo que contesta los dos
  // condicionales del circuito sin preguntarle nada a nadie.
  const [{ data: g }, { data: equiposDelCliente }, tecnicos] = await Promise.all([
    a.equipo_id
      ? supabase.rpc("garantia_del_equipo", { p_equipo: a.equipo_id })
      : Promise.resolve({ data: null }),
    // Las series del cliente: para el clic de la garantía (Carlos, 01-09) y,
    // con la principal ya puesta, para agregar otras al mismo caso (0253).
    a.cuenta_id
      ? supabase
          .from("equipos_instalados")
          .select("id, serie, modelo_texto, garantia_hasta, ultimo_mantenimiento, fecha_venta")
          .eq("cuenta_id", a.cuenta_id)
          .order("fecha_venta", { ascending: false, nullsFirst: false })
          .limit(20)
      : Promise.resolve({ data: [] as never[] }),
    // Los técnicos que ya firmaron trabajos, para sugerirlos al agendar.
    tecnicosConocidos(supabase),
  ]);
  // Las otras máquinas del caso (0253) y, si el cliente no tiene ninguna en el
  // parque, el pedido que salió sin series: es lo que le pasó a Gary Group.
  const [{ data: adicionales }, { data: pedidosSinSeries }, { data: pedidosAbiertos }] = await Promise.all([
    supabase.from("atencion_equipos").select("equipo_id").eq("atencion_id", a.id),
    a.cuenta_id && (equiposDelCliente ?? []).length === 0
      ? supabase.from("servicios_postventa").select("id, equipo, despachado_at, guia").eq("cuenta_id", a.cuenta_id).not("despachado_at", "is", null).is("cerrado_at", null).order("despachado_at", { ascending: false }).limit(3)
      : Promise.resolve({ data: [] as { id: string; equipo: string | null; despachado_at: string | null; guia: string | null }[] }),
    // EL CASO REPETITIVO (Carlos, 22-09, sobre Titan): «se está capturando un
    // caso cuando esto es repetitivo, de despacho, en pedidos». Si esta
    // atención todavía NO se enganchó sola a un pedido (0244 — solo engancha
    // las de tipo puesta_en_marcha), se avisa de una vez que el cliente tiene
    // pedidos sin cerrar: puede ser el mismo asunto, sin scrollear hasta el
    // historial de abajo para descubrirlo.
    a.cuenta_id && !pedidoEnganchado
      ? supabase
          .from("servicios_postventa")
          .select("id, equipo, cliente_texto, fecha_despacho, despachado_at, puesta_en_marcha")
          .eq("cuenta_id", a.cuenta_id)
          .eq("completado", false)
          .is("cerrado_at", null)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as { id: string; equipo: string | null; cliente_texto: string | null; fecha_despacho: string | null; despachado_at: string | null; puesta_en_marcha: string | null }[] }),
  ]);
  const adicionalesIds = (adicionales ?? []).map((x) => x.equipo_id as string);
  const listaPedidosAbiertos = pedidosAbiertos ?? [];
  // «¿ES EL MISMO CLIENTE?» (0272, ítem 9 de la reunión del 22-09): «también a
  // postventa» — Carlos vio el panel de relacionados solo del lado comercial.
  const candidatasRelacionadas = a.cuenta_id ? await candidatosMismoCliente(a.cuenta_id) : [];
  const supervisoresFusion = candidatasRelacionadas.length > 0 ? await cargarSupervisores(supabase) : [];
  const garantia = (g as {
    en_garantia: boolean;
    garantia_hasta: string | null;
    hizo_preventivo: boolean;
    ultimo_mantenimiento: string | null;
    serie: string | null;
  } | null) ?? null;

  const reloj = relojAtencion(a);

  // LAS LLAMADAS QUE SALIERON DE ESTE CASO (reunión 25-09, Ruby). El caso
  // técnico solo verificaba la garantía: para derivar la llamada al almacén
  // había que irse a «Clientes que atiendo», y esa llamada no quedaba colgada
  // del caso. Ahora se deriva desde acá, con el problema ya escrito.
  const { data: llamadasDelCaso } = await supabase
    .from("aperturas_llamada")
    .select("id, tipo, programada_para, tomada_at, informe_at, revisada_at, enviada_cliente_at, anulada_at, urgente")
    .eq("atencion_id", a.id)
    .order("programada_para", { ascending: false });
  const equiposParaLlamada = [a.equipo_texto, garantia?.serie ? `serie ${garantia.serie}` : null].filter(Boolean).join(" · ");

  // ¿QUIÉN PUEDE COTIZAR ESTA ATENCIÓN? La cotización se guarda contra la
  // oportunidad, y `crear_cotizacion` solo la acepta del comercial dueño (o de
  // gerencia). No es lo mismo ver la atención que poder cotizarla: Ariana tiene
  // la vista de mantenimiento que le abrió operaciones (`hace_postventa`, desde
  // el 02-09) y entra a las atenciones, pero las 19 oportunidades vivas son de
  // la cuenta de postventa. Sin esta comprobación, el botón la llevaría a un
  // cotizador donde no podría guardar nada: mejor decirle de quién es.
  const perfil = await requerirPerfil();
  const { data: duenio } = a.oportunidad_id
    ? await supabase
        .from("oportunidades")
        .select("comercial_id, perfiles(nombre)")
        .eq("id", a.oportunidad_id)
        .maybeSingle()
    : { data: null };
  const comercialDeLaPista = (duenio?.perfiles as unknown as { nombre: string } | null)?.nombre ?? null;
  const puedeCotizarla =
    duenio?.comercial_id === perfil.id || perfil.rol === "gerencia" || perfil.rol === "admin";

  // «En la parte derecha debe estar el historial de cómo llegó» (ing. Carlos,
  // reunión 01-09): la misma ruta que ven el comercial y Central — llegó a
  // Central, se derivó, primer contacto — mirada desde la atención. Solo para
  // lo que entró por Central: una atención registrada a mano no tiene ruta y
  // mostrarla vacía sería ruido (mismo criterio que la vista del comercial).
  let rutaDelContacto: Hito[] | null = null;
  if (a.oportunidad_id) {
    const [{ data: op }, { data: leadDirecto }] = await Promise.all([
      supabase.from("oportunidades").select("id, lead_id, created_at").eq("id", a.oportunidad_id).maybeSingle(),
      // El vínculo directo (0141) cubre también al lead que se SUMÓ a un
      // expediente ya abierto; el primero en llegar es el que cuenta la ruta.
      supabase
        .from("leads")
        .select("id, canal, recibido_at, asignado_at")
        .eq("oportunidad_id", a.oportunidad_id)
        .order("recibido_at")
        .limit(1)
        .maybeSingle(),
    ]);
    const leadId = leadDirecto?.id ?? op?.lead_id ?? null;
    if (leadId) {
      const [{ data: lead }, { data: asignacion }, { data: primeraGestion }] = await Promise.all([
        leadDirecto
          ? Promise.resolve({ data: leadDirecto })
          : supabase.from("leads").select("id, canal, recibido_at, asignado_at").eq("id", leadId).maybeSingle(),
        supabase
          .from("asignaciones")
          .select("motivo, decidida_por, created_at")
          .eq("lead_id", leadId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("actividades")
          .select("tipo, realizada_at")
          .eq("oportunidad_id", a.oportunidad_id)
          .order("realizada_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      if (lead) {
        const { data: quienDerivo } = asignacion?.decidida_por
          ? await supabase.from("perfiles").select("nombre").eq("id", asignacion.decidida_por).maybeSingle()
          : { data: null };
        const asignadoAt = lead.asignado_at ?? asignacion?.created_at ?? op?.created_at ?? null;
        rutaDelContacto = [
          {
            titulo: "Llegó a Central",
            fecha: lead.recibido_at,
            detalle: ETIQUETA_CANAL[lead.canal] ?? lead.canal,
            pendiente: "Sin registro de ingreso",
          },
          {
            titulo: "Se derivó a postventa",
            fecha: asignadoAt,
            demora: demora(lead.recibido_at, asignadoAt),
            detalle: [
              quienDerivo?.nombre ? `por ${quienDerivo.nombre}` : null,
              asignacion?.motivo ? (ETIQUETA_MOTIVO[asignacion.motivo] ?? asignacion.motivo) : null,
            ]
              .filter(Boolean)
              .join(" · "),
            pendiente: "Sin derivar",
          },
          {
            titulo: "Primer contacto del área",
            fecha: primeraGestion?.realizada_at ?? null,
            demora: demora(asignadoAt, primeraGestion?.realizada_at ?? null),
            detalle: primeraGestion ? (ETIQUETA_ACTIVIDAD[primeraGestion.tipo] ?? primeraGestion.tipo) : null,
            pendiente: "Todavía sin gestión registrada",
          },
        ];
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/postventa/atenciones"
              className="mb-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <ArrowLeft className="size-3.5" /> Atenciones del área
            </Link>
            <h1 className="text-lg font-bold leading-snug text-foreground">
              {a.cuentas?.razon_social ?? a.cliente_texto ?? "Cliente sin nombre"}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Wrench className="size-3.5" />
                {ETIQUETA_TIPO_ATENCION[a.tipo]}
                <span className="rounded-full bg-secondary px-1.5 text-[10px] font-semibold">
                  pista {PISTA_DE_TIPO[a.tipo]}
                </span>
                <CambiarTipoAtencion atencionId={a.id} tipo={a.tipo} etapa={a.etapa} />
              </span>
              {/* LA PUESTA EN MARCHA ES DEL PEDIDO (Carlos, 15-09; 0244): «tiene que
                  ser relacionado con el cliente máster». Se engancha sola al
                  pedido vivo del cliente sin puesta en marcha, y al cerrar
                  resuelta el pedido queda con su fecha. */}
              {pedidoEnganchado && (
                <Link
                  href={`/postventa/pedidos/${pedidoEnganchado.id}`}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 hover:underline"
                >
                  <Package className="size-3" />
                  Es la puesta en marcha del pedido
                  {pedidoEnganchado.despachado_at ? ` despachado el ${fechaLima(pedidoEnganchado.despachado_at)}` : pedidoEnganchado.fecha_despacho ? ` programado para el ${fechaLima(pedidoEnganchado.fecha_despacho)}` : ""}
                  {pedidoEnganchado.puesta_en_marcha ? " · ya con puesta en marcha" : " · al cerrar, el pedido queda con su fecha"}
                </Link>
              )}
              {a.cuentas?.num_doc && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="size-3.5" /> RUC {a.cuentas.num_doc}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" /> Entró el {fechaHoraLima(a.solicitado_at)}
              </span>
            </div>
            {/* Otra razón social del mismo dueño (23-09): el equipo o el
                reclamo pueden estar en la otra ficha. */}
            <AvisoMismoCliente cuentaId={a.cuenta_id} className="mt-2" />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-bold",
                reloj.estado === "rojo"
                  ? "bg-destructive/10 text-destructive"
                  : reloj.estado === "ambar"
                    ? "bg-amber-500/10 text-amber-700"
                    : "bg-[#1E7F4F]/10 text-[#1E7F4F]",
              )}
            >
              {a.cerrado_at
                ? "Cerrada"
                : a.tomada_at
                  ? `Atendida en ${reloj.horas < 1 ? `${Math.max(1, Math.round(reloj.horas * 60))} min` : `${Math.round(reloj.horas * 10) / 10} h`}`
                  : `${Math.floor(reloj.horas)} h de ${reloj.limite} h`}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {a.tomada_at
                ? `Atendida el ${fechaHoraLima(a.tomada_at)}${
                    (a as { tomadaPor?: { nombre: string } | null }).tomadaPor
                      ? ` por ${(a as { tomadaPor?: { nombre: string } | null }).tomadaPor?.nombre}`
                      : ""
                  }`
                : a.perfiles
                  ? `La tiene ${a.perfiles.nombre}`
                  : "Todavía no la tomó nadie"}
            </span>
          </div>
        </div>
      </div>

      {/* EL CASO REPETITIVO (Carlos, 22-09): «se está capturando un caso
          cuando esto es repetitivo, de despacho, en pedidos». Lesly: «yo lo
          tengo allí y yo tengo que generarme el caso». Si el 0244 no la
          enganchó sola (solo lo hace para tipo puesta_en_marcha), acá se
          avisa que el cliente tiene pedidos sin cerrar, antes de trabajar
          esto como un caso aparte. */}
      {listaPedidosAbiertos.length > 0 && (
        <div className="rounded-xl border border-amber-400/50 bg-amber-500/5 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
            <Package className="size-4" /> Este cliente tiene {listaPedidosAbiertos.length === 1 ? "un pedido" : `${listaPedidosAbiertos.length} pedidos`} sin cerrar
          </p>
          <p className="mt-1 text-xs text-amber-900/80">
            Revíselos antes de trabajar esto como un caso aparte: puede ser lo mismo. Si es la puesta en marcha de
            uno de ellos, cámbiele el tipo arriba a «Puesta en marcha» y se engancha sola.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {listaPedidosAbiertos.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/postventa/pedidos/${p.id}`}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-400/60 bg-card px-2.5 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-500/10"
                >
                  <Package className="size-3" />
                  {(p.equipo ?? "Equipo").split("\n")[0].slice(0, 40)}
                  {p.despachado_at ? " · despachado" : p.fecha_despacho ? ` · programado ${fechaLima(p.fecha_despacho)}` : " · sin fecha"}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {a.cuenta_id && candidatasRelacionadas.length > 0 && (
        <FichasRelacionadas cuentaId={a.cuenta_id} candidatas={candidatasRelacionadas} supervisores={supervisoresFusion} />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <SeccionPanel
            titulo="El circuito"
            accion={
              a.cuenta_id && !a.cerrado_at ? (
                <AperturaLlamadaBoton
                  cuentaId={a.cuenta_id}
                  atencionId={a.id}
                  tipo="soporte_videollamada"
                  etiqueta="Derivar llamada al almacén"
                  equipos={equiposParaLlamada}
                  problema={a.detalle ?? ""}
                  compacto
                />
              ) : undefined
            }
          >
            {(llamadasDelCaso ?? []).length > 0 && (
              <div className="mb-3 space-y-1 rounded-md border border-border bg-secondary/40 p-2.5 text-xs">
                <p className="font-semibold text-foreground">Llamadas derivadas de este caso</p>
                {((llamadasDelCaso ?? []) as unknown as AperturaLlamada[]).map((l) => (
                  <Link key={l.id} href={`/aperturas/${l.id}`} className="flex flex-wrap items-center gap-x-2 text-primary hover:underline">
                    <span>{ETIQUETA_TIPO_APERTURA[l.tipo]}</span>
                    <span className="text-muted-foreground">· {fechaHoraLima(l.programada_para)} · {ETIQUETA_ESTADO_APERTURA[estadoApertura(l)]}</span>
                  </Link>
                ))}
              </div>
            )}
            <LineaAtencion
              atencion={a}
              puedeCotizar={puedeCotizarla}
              tecnicos={tecnicos}
              garantia={garantia}
              hayMaquinas={(equiposDelCliente ?? []).length > 0}
              pedidoSinSeries={(pedidosSinSeries ?? [])[0] ?? null}
              cliente={a.cuentas?.razon_social ?? a.cliente_texto ?? "Cliente"}
            />
          </SeccionPanel>

          {/* DOS BLOQUES, NO UNO. Hasta la 0185 el diagnóstico del técnico se
              guardaba encima de lo que había dicho el cliente y el texto
              original desaparecía sin aviso. Lo que dice el cliente es prueba:
              en un reclamo de garantía, la diferencia entre «no centrifuga» y
              «se le metió una moneda en la bomba» decide quién paga. */}
          {a.detalle && (
            <SeccionPanel titulo="Lo que reportó el cliente">
              <p className="whitespace-pre-line text-sm text-foreground">{a.detalle}</p>
              {/* Carlos, 21-09: «¿quién lo registró? ¿la central?». Que se lea
                  quién y cuándo, para saber a quién preguntarle. */}
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {a.recibidoPor
                  ? `Lo registró ${a.recibidoPor.nombre}${a.recibidoPor.codigo_comercial ? ` (${a.recibidoPor.codigo_comercial})` : ""} el ${fechaHoraLima(a.solicitado_at)}. `
                  : `Entró el ${fechaHoraLima(a.solicitado_at)}. `}
                Con sus palabras, tal como entró. No se edita.
              </p>
            </SeccionPanel>
          )}

          {a.no_facturado_motivo && (
            <SeccionPanel titulo="Se cerró sin facturar">
              <p className="whitespace-pre-line text-sm text-foreground">{a.no_facturado_motivo}</p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Este caso se cobraba y se cerró sin cotización. Queda escrito por qué (0189).
              </p>
            </SeccionPanel>
          )}

          {a.diagnostico && (
            <SeccionPanel titulo="Lo que encontró el técnico">
              <p className="whitespace-pre-line text-sm text-foreground">{a.diagnostico}</p>
              {a.diagnosticado_at && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Diagnosticado el {fechaHoraLima(a.diagnosticado_at)}.
                </p>
              )}
            </SeccionPanel>
          )}

          {/* «Le hicieron preventivo y correctivo este año y solo sale lo del
              2024» (postventa, 01-09, caso PERUVIAN NATURE): todo lo hecho o
              vendido a este cliente, por año, venga de donde venga. */}
          {/* PRIMERO LA MÁQUINA, DESPUÉS EL CLIENTE. Carlos, 09-09: «cuando
              deriva esa llamada, tiene que ir con el histórico de las
              incidencias de ESE EQUIPO… no solo el histórico de la llamada,
              sino más bien los informes». Un hotel con seis lavadoras necesita
              las dos vistas, pero la pregunta «¿esta máquina ya falló antes?»
              solo la contesta esta, y es la que decide a quién se manda. */}
          {a.equipo_id && (
            <SeccionPanel titulo="Lo que ya se le hizo a ESTA máquina">
              <HistorialDelEquipo equipoId={a.equipo_id} atencionActualId={a.id} />
            </SeccionPanel>
          )}

          {a.cuenta_id && (
            <SeccionPanel titulo="Lo que ya se le hizo a este cliente">
              <HistorialPostventaCliente cuentaId={a.cuenta_id} verPrecios={puedeVerPrecios(await requerirPerfil())} />
            </SeccionPanel>
          )}
        </div>

        <div className="space-y-4">
          {/* «CUANDO REGISTRAN, NO SALEN LOS DATOS DEL CLIENTE» — la señorita
              de Central, 08-09, mirando esta misma pantalla. La cabecera decía
              razón social, RUC y fecha, y el Paso 3 pide agendar la visita
              «cuándo y con quién»: la pantalla mandaba a llamar al cliente sin
              decir a qué número. El teléfono vivía a dos pantallas de acá.

              Va PRIMERO en esta columna, arriba de todo: es lo que hace falta
              para dar el siguiente paso, no un dato de consulta. */}
          <SeccionPanel titulo="Con quién hablar">
            <ConQuienHablar cuentaId={a.cuenta_id ?? null} oportunidadId={a.oportunidad_id} />
          </SeccionPanel>

          {/* El clic de la garantía (Carlos, 01-09): cuando el equipo aún no
              está identificado, acá salen las series del cliente para
              contrastar con la foto de la placa. Un clic vincula y verifica. */}
          {a.cuenta_id && (
            <SeccionPanel titulo={a.equipo_id ? "Las máquinas de este caso" : "¿De qué máquina habla el cliente?"}>
              <EquiposDeLaAtencion atencionId={a.id} equipos={equiposDelCliente ?? []} principalId={a.equipo_id} adicionalesIds={adicionalesIds} />
              {!a.cerrado_at && (a.equipo_id || (equiposDelCliente ?? []).length > 0) && (
                <OtraMaquinaDelCaso
                  atencionId={a.id}
                  cuenta={{ id: a.cuenta_id, razonSocial: a.cuentas?.razon_social ?? a.cliente_texto ?? "Cliente" }}
                  hayPrincipal={Boolean(a.equipo_id)}
                />
              )}
            </SeccionPanel>
          )}

          {/* «En la parte derecha, donde se puede poner, debe estar el
              historial de cómo llegó» — ing. Carlos, 01-09. */}
          {rutaDelContacto && (
            <SeccionPanel titulo="Cómo llegó este contacto">
              <RutaDerivacion hitos={rutaDelContacto} />
            </SeccionPanel>
          )}

          {a.oportunidad_id && (
            <SeccionPanel titulo="La pista comercial">
              {/* COTIZAR DESDE LA ATENCIÓN. Es el pedido textual del ing.
                  Carlos del 01-09: «en atención también debe haber la
                  oportunidad para poder cotizar… porque viene de un problema».
                  Estaba anotado como pendiente y seguía sin hacerse: había
                  que salir a buscar la oportunidad por el menú, y por eso los
                  mantenimientos se seguían cotizando en Word.

                  El enlace es directo al cotizador, no a la oportunidad: el
                  técnico ya sabe qué hay que vender —lo acaba de ver— y lo que
                  necesita es escribirlo. Desde hoy el cotizador acepta líneas
                  escritas a mano, así que un mantenimiento o un repuesto se
                  cotizan sin esperar a que estén en el catálogo. */}
              {puedeCotizarla ? (
                <>
                  <Link
                    href={`/comercial/oportunidades/${a.oportunidad_id}/cotizar?caso=${a.id}`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                  >
                    <FileText className="size-3.5" />
                    Cotizar lo que haga falta
                  </Link>
                  <p className="mt-2 text-xs text-muted-foreground">
                    El mantenimiento, el repuesto o la visita se escriben directamente en la cotización, aunque
                    todavía no estén en el catálogo.
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Esta pista comercial la lleva <b className="text-foreground">{comercialDeLaPista ?? "otro comercial"}</b>: la
                  cotización la hace quien tiene la cuenta. Si hay algo para vender, se avisa desde el circuito y
                  Central lo reparte.
                </p>
              )}
              {/* LA LLAMADA SE ANOTA DESDE ACÁ (Gabriela, 18-09: «ya me comuniqué
                  con el cliente, no se puede registrar la llamada»). El botón
                  abre el registro de gestión de la oportunidad ya desplegado;
                  antes había que descubrir que la llamada vivía en la otra
                  pista. El circuito técnico no avanza con la llamada: avanza
                  eligiendo la máquina en el Paso 1. */}
              <Link
                href={`/comercial/oportunidades/${a.oportunidad_id}?gestion=1`}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                <PhoneCall className="size-3.5" /> Registrar la llamada / gestión
              </Link>
              <Link
                href={`/comercial/oportunidades/${a.oportunidad_id}`}
                className="mt-2 ml-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Ver la oportunidad
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">
                Las llamadas y el historial se registran en la oportunidad. La atención técnica y la venta corren en
                paralelo: son dos pistas, no una. Para avanzar el circuito, elija la máquina en el Paso 1.
              </p>
            </SeccionPanel>
          )}
        </div>
      </div>
    </div>
  );
}
