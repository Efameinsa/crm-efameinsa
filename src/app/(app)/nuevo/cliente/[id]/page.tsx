import { MensajesMiCuenta } from "@/components/crm/mensajes-mi-cuenta";
import { VolverALaLista } from "@/components/crm/volver-a-la-lista";
import Link from "@/components/enlace";
import { notFound } from "next/navigation";
import { ArrowRight, Building2, CalendarClock, ClipboardList, FileText, MapPin, Pencil, UserRound } from "lucide-react";
import { etiquetaTipoExpediente } from "@/lib/tipo-expediente";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { puedeVerPrecios, veTodoPostventa } from "@/lib/postventa";
import { cargarHistorialCuenta } from "@/lib/historial-cuenta";
import { firmarAdjuntosDeCierres } from "@/lib/adjuntos-cierre";
import { fechaLima, fechaAgendada, fechaCalendario } from "@/lib/fechas";
import { cn } from "@/lib/utils";
import { guardaFichaCliente } from "@/lib/propuesta/guardas";
import { PendientesDelCliente } from "@/components/crm/pendientes-del-cliente";
import { UltimosCierres } from "@/components/crm/ultimos-cierres";
import { EquiposDelCliente } from "@/components/crm/equipos-del-cliente";
import { FicharMaquina } from "@/components/crm/fichar-maquina";
import { HistorialCuenta } from "@/components/crm/historial-cuenta";
import { ListaInformesCierre, TablaComprasAnteriores } from "@/components/crm/secciones-cliente";
import { AperturaLlamadaBoton } from "@/components/crm/apertura-llamada-boton";
import { VisitaPlantaBoton } from "@/components/crm/visita-planta-boton";
import { AnotarGestionPanel } from "@/components/crm/anotar-gestion-panel";
import { MasAcciones } from "@/components/crm/mas-acciones";
import { FijaBajoCabecera } from "@/components/crm/fija-bajo-cabecera";
import type { MotivoRechazo, ResultadoGestion } from "@/components/crm/registro-rapido";
import { Plus } from "lucide-react";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ResumenCuenta } from "@/components/crm/resumen-cuenta";
import { GrupoEconomico } from "@/components/crm/grupo-economico";
import { AvisoMismoCliente } from "@/components/crm/aviso-mismo-cliente";
import { ReasignarCarteraBoton } from "@/components/crm/reasignar-cartera-boton";
import { AccionNuevoInforme } from "@/components/crm/secciones-cliente";
import { ContactosEditables, type ContactoEditable } from "@/components/crm/contactos-editables";
import { IdentidadCuenta } from "@/components/crm/identidad-cuenta";
import { CambiarRubro } from "@/components/crm/cambiar-rubro";
import { DocumentosDelServidor } from "@/components/crm/documentos-del-servidor";
import { OfrecerMantenimientoBoton } from "@/components/crm/ofrecer-mantenimiento-boton";
import { TraerPedidoAntiguoBoton } from "@/components/crm/traer-pedido-antiguo-boton";
import { ListaOportunidadesCuenta, rangoOportunidad } from "@/components/crm/ficha-cuenta";
import { TipoExpedienteBadge } from "@/components/crm/tipo-expediente-badge";
import { EtapaBadge } from "@/components/crm/etapa-badge";
import { AnotarClienteReciente } from "@/components/crm/clientes-recientes";
import { InformesTecnicosDelCliente } from "@/components/crm/informes-tecnicos-del-cliente";
import { cierresDePostventa } from "@/lib/precios-postventa";
import { VincularRazonSocial } from "@/components/crm/vincular-razon-social";
import { ETIQUETA_TIPO_ATENCION, tituloDelTipo, type TipoAtencion } from "@/lib/atenciones";
import { AperturaServicioCaso, type CasoParaApertura } from "@/components/crm/apertura-servicio-caso";
import { CorreosDeCampana, HistorialCorreosDeCampana } from "@/components/crm/correos-de-campana";
import { LlamadasDelCliente } from "@/components/crm/llamadas-del-cliente";
import { BotonLlamar } from "@/components/crm/boton-llamar";

export const dynamic = "force-dynamic";

const PESTANAS = [
  { clave: "resumen", etiqueta: "Resumen" },
  { clave: "pedidos", etiqueta: "Pedidos y casos" },
  { clave: "equipos", etiqueta: "Equipos" },
  { clave: "ventas", etiqueta: "Ventas" },
  { clave: "historial", etiqueta: "Historial" },
  { clave: "llamadas", etiqueta: "Llamadas" },
  { clave: "correos", etiqueta: "Correos de campaña" },
  { clave: "documentos", etiqueta: "Documentos y sedes" },
  { clave: "contactos", etiqueta: "Datos y contactos" },
] as const;

/**
 * FICHA 360 DEL CLIENTE (propuesta, 23-09).
 *
 * La ficha de hoy es una página larga: resumen, expedientes, documentos,
 * cierres, compras, historial y contactos uno debajo del otro, y lo vivo del
 * cliente se pierde entre la historia. Acá la cabecera queda fija con lo que
 * se pregunta primero (de quién es, cuándo compró, qué tiene abierto, sus
 * equipos) y las acciones del día; el contenido va en pestañas, y la de
 * entrada —Resumen— es solo lo que pide acción y lo último que pasó.
 */
export default async function Ficha360Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; corregir?: string }> }) {
  const { id } = await params;
  const { tab, corregir } = await searchParams;
  const pestana = PESTANAS.find((p) => p.clave === tab)?.clave ?? "resumen";
  const perfil = await requerirPerfil();
  guardaFichaCliente(perfil);
  const verPrecios = puedeVerPrecios(perfil);
  const esArea = veTodoPostventa(perfil);
  // Quién puede abrir un informe técnico: su pantalla vive en /postventa (28-09).
  const abreInformes =
    (Boolean(perfil.es_postventa) && !perfil.solo_preventivo) || Boolean(perfil.es_almacen) || ["gerencia", "admin"].includes(perfil.rol);
  // LAS MISMAS REGLAS QUE LA FICHA DE SIEMPRE (auditoría 25-09): quién ve cada
  // acción no cambia con la vista.
  const comoGerencia = ["gerencia", "admin"].includes(perfil.rol);
  // Central entra a leer (buzón 17-10): lo mismo que en su ficha de siempre
  // —sin corregir, registrar ni anotar— y cada expediente abre su derivación.
  const comoCentral = perfil.rol === "central";
  const haceCasos = Boolean(perfil.es_postventa) || Boolean(perfil.hace_postventa);
  const puedeCrearRubros = ["gerencia", "admin", "operaciones"].includes(perfil.rol) || Boolean(perfil.es_operaciones);
  const supabase = await createClient();

  const { data: cuenta } = await supabase
    .from("cuentas")
    .select(
      "id, razon_social, nombre_comercial, tipo_doc, num_doc, rubro_id, comercial_id, carpetas_servidor, direccion, ultima_venta_at, cartera_desde, notas, fusionada_en, perfiles(nombre, codigo_comercial), contactos(id, nombre, cargo, telefono, email, documento, direccion, es_principal, categoria, origen, agregado_at, agregado:perfiles!contactos_agregado_por_fkey(nombre))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!cuenta) notFound();

  const [{ data: rubros }, { data: comerciales }, { data: resultadosGestion }, { data: motivosRechazo }] = await Promise.all([
    supabase.from("catalogo_rubros").select("id, nombre").eq("activo", true).order("nombre"),
    comoGerencia
      ? supabase.from("perfiles").select("id, nombre, codigo_comercial").eq("rol", "comercial").eq("activo", true).eq("es_prueba", false).eq("es_soporte", false).order("codigo_comercial")
      : Promise.resolve({ data: null }),
    // Lo que pide «Anotar gestión» (el mismo formulario del expediente).
    supabase.from("catalogo_resultados_gestion").select("id, codigo, nombre, accion_sugerida, dias_sugeridos, efecto").eq("activo", true).order("orden"),
    supabase.from("catalogo_motivos_rechazo").select("id, nombre, solo_postventa, requiere_nota").eq("activo", true).order("nombre"),
  ]);
  const [
    { count: pedidosAbiertos },
    { count: equipos },
    { count: casosAbiertos },
    { data: informes },
    { data: oportunidades },
    { data: casosSinApertura },
  ] = await Promise.all([
    supabase.from("servicios_postventa").select("id", { count: "exact", head: true }).eq("cuenta_id", id).is("cerrado_at", null),
    supabase.from("equipos_instalados").select("id", { count: "exact", head: true }).eq("cuenta_id", id),
    supabase.from("atenciones").select("id", { count: "exact", head: true }).eq("cuenta_id", id).is("cerrado_at", null),
    supabase.from("informes_cierre").select("id, codigo, serie, fecha, monto_total, moneda, emitido_at, adjuntos, anulado_at").eq("cuenta_id", id).order("created_at", { ascending: false }),
    supabase
      .from("oportunidades")
      .select("id, etapa, intencion, tipo_postventa, proxima_accion, proxima_accion_at, proxima_accion_hora, cerrada_at, monto_estimado, moneda, comercial_id, lead_id, perfiles:comercial_id(nombre, codigo_comercial)")
      .eq("cuenta_id", id)
      .order("cerrada_at", { ascending: true, nullsFirst: true })
      .limit(50),
    // Casos abiertos sin apertura de servicio (0407): de ellos sale la de la cabecera.
    supabase
      .from("atenciones")
      .select("id, tipo, tipo_detalle, equipo_texto, detalle, en_garantia, tecnico, solicitado_at")
      .eq("cuenta_id", id)
      .is("cerrado_at", null)
      .is("servicio_id", null)
      .order("solicitado_at", { ascending: false })
      .limit(20),
  ]);
  const dueno = cuenta.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
  const contactos = (cuenta.contactos ?? []) as unknown as ContactoEditable[];
  // Un operativo (0352: quien recibe, el técnico) no es la cara del cliente: va último.
  const principal = contactos.find((c) => c.es_principal) ?? contactos.find((c) => c.categoria !== "operativo") ?? contactos[0];
  const ops = (oportunidades ?? []) as unknown as {
    id: string; etapa: string; tipo_postventa: string | null; proxima_accion: string | null; proxima_accion_at: string | null; proxima_accion_hora: string | null;
    cerrada_at: string | null; monto_estimado: number | null; moneda: string; intencion: string | null; comercial_id: string | null; lead_id: string | null;
    perfiles: { nombre: string; codigo_comercial: string | null } | null;
  }[];
  const vivas = ops.filter((o) => !o.cerrada_at && !["venta", "rechazada", "derivada", "historico"].includes(o.etapa));
  const derivacionPorExpediente = comoCentral ? await derivacionesDeExpedientes(ops) : null;
  const siguiente = vivas.filter((o) => o.proxima_accion_at).sort((a, b) => (a.proxima_accion_at! < b.proxima_accion_at! ? -1 : 1))[0];

  const casosApertura: CasoParaApertura[] = (casosSinApertura ?? []).map((c) => ({
    id: c.id as string,
    etiqueta: [
      c.solicitado_at ? fechaLima(c.solicitado_at as string) : null,
      tituloDelTipo(c.tipo as TipoAtencion, c.tipo_detalle as string | null),
      (c.equipo_texto as string | null) || null,
      ((c.detalle as string | null) ?? "").slice(0, 70) || null,
    ].filter(Boolean).join(" · "),
    enGarantia: Boolean(c.en_garantia),
    tecnico: (c.tecnico as string | null) ?? null,
    tipo: (c.tipo as string | null) ?? null,
    tipoDetalle: (c.tipo_detalle as string | null) ?? null,
  }));

  const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
  const chips: { etiqueta: string; valor: string; tab: string; alerta?: boolean; vacio?: boolean }[] = [
    { etiqueta: plural(vivas.length, "expediente vivo", "expedientes vivos"), valor: String(vivas.length), tab: "resumen", vacio: vivas.length === 0 },
    { etiqueta: plural(pedidosAbiertos ?? 0, "pedido abierto", "pedidos abiertos"), valor: String(pedidosAbiertos ?? 0), tab: "pedidos", alerta: (pedidosAbiertos ?? 0) > 0, vacio: !pedidosAbiertos },
    { etiqueta: plural(casosAbiertos ?? 0, "caso técnico", "casos técnicos"), valor: String(casosAbiertos ?? 0), tab: "pedidos", alerta: (casosAbiertos ?? 0) > 0, vacio: !casosAbiertos },
    { etiqueta: plural(equipos ?? 0, "equipo", "equipos"), valor: String(equipos ?? 0), tab: "equipos", vacio: !equipos },
    { etiqueta: "última venta", valor: cuenta.ultima_venta_at ? fechaCalendario(cuenta.ultima_venta_at) : "nunca", tab: "ventas", vacio: !cuenta.ultima_venta_at },
  ];
  // Quién anota desde la ficha: postventa en el expediente del área; el
  // comercial, solo en su cartera (las mismas reglas que «Registrar seguimiento»).
  const anotaGestion = !comoGerencia && !comoCentral && (haceCasos || cuenta.comercial_id === perfil.id);
  const enlaceExpediente = (id: string) => enlaceDelExpediente(id, derivacionPorExpediente);

  return (
    <div className="space-y-4">
      <VolverALaLista />
      <AnotarClienteReciente id={cuenta.id} nombre={cuenta.razon_social} />
      {/* LA CABECERA: quién es, de quién es, qué tiene y qué se hace.
          17-10 (Ariana PV3, «no veo la información completa»): en 1280×720
          esta tarjeta era FIJA y medía 290 px —siete botones iguales, cinco
          cuadros y las pestañas—; con la barra y el aviso de arriba dejaba
          225 px para leer, y al bajar seguía tapando. Ahora se va con el
          scroll; lo que queda fijo es la tira delgada de las pestañas.
          «Anotar gestión» es el botón de todos los días; lo de vez en cuando
          va en «Más acciones». */}
      <div className="-mx-1 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Building2 className="size-3.5" /> Cliente · cartera de {dueno ? `${dueno.codigo_comercial ?? ""} ${dueno.nombre}`.trim() : "nadie"}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="truncate text-xl font-bold text-foreground">{cuenta.razon_social}</h1>
              {/* DONDE SE LEE EL NOMBRE, SE CORRIGE (Rubí, 14-10): escribió mal
                  el nombre del HOSPITAL CHANKA en la apertura y no encontraba
                  cómo arreglarlo — el botón estaba dos pestañas más allá y, sin
                  RUC, decía «Vincular RUC». Lleva al bloque ya abierto para
                  editar; la base sigue decidiendo quién puede guardar. */}
              {!comoCentral && (
              <Link
                href={`?tab=contactos&corregir=1#datos-del-cliente`}
                className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-primary hover:underline"
                title="Corregir la razón social, el tipo y número de documento o el rubro"
              >
                <Pencil className="size-3" /> Corregir nombre o RUC
              </Link>
              )}
            </div>
            {comoGerencia && (
              <div className="mt-1">
                <ReasignarCarteraBoton cuentaId={cuenta.id} razonSocial={cuenta.razon_social} comercialActual={cuenta.comercial_id as string | null} comerciales={comerciales ?? []} />
              </div>
            )}
            <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {cuenta.num_doc ? (
                <span className="inline-flex items-center gap-1">
                  <FileText className="size-3.5" /> {cuenta.tipo_doc} {cuenta.num_doc}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-medium text-amber-700" title="La cotización y el informe salen sin RUC hasta que se vincule">
                  <FileText className="size-3.5" /> Sin RUC
                </span>
              )}
              {cuenta.direccion && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" /> {cuenta.direccion}
                </span>
              )}
              {principal && (
                <span className="inline-flex items-center gap-1">
                  <UserRound className="size-3.5" /> {principal.nombre}
                  {principal.telefono ? (
                    <>
                      {" · "}
                      {comoCentral ? principal.telefono : <BotonLlamar numero={principal.telefono} cuentaId={cuenta.id} contactoId={principal.id} />}
                    </>
                  ) : null}
                </span>
              )}
              {cuenta.cartera_desde && <span>Cliente desde {fechaLima(cuenta.cartera_desde)}</span>}
            </p>
            <AvisoMismoCliente cuentaId={cuenta.id} baseHref={comoCentral ? "/central/clientes" : comoGerencia ? "/gerencia/clientes" : undefined} className="mt-2" />
          </div>
          <div className="flex max-w-xl flex-wrap items-center justify-end gap-1.5">
            {anotaGestion && (
              <AnotarGestionPanel
                cuentaId={cuenta.id}
                comercial={!haceCasos}
                esPostventa={haceCasos}
                resultados={(resultadosGestion ?? []) as ResultadoGestion[]}
                motivos={(motivosRechazo ?? []) as MotivoRechazo[]}
                expedientes={vivas.map((o) => ({ id: o.id, etiqueta: etiquetaExpediente(o) }))}
              />
            )}
            {haceCasos && !perfil.solo_preventivo && (
              <Link
                href={`/postventa/casos/nuevo?cuenta=${cuenta.id}`}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Plus className="size-3.5" /> Registrar un caso
              </Link>
            )}
            {/* Apertura de servicio desde la ficha (buzón, Rubí 07-10): para una
                visita al local del cliente, no solo para un despacho. Sale de un
                caso; si no hay uno abierto, primero se registra. */}
            {haceCasos && !perfil.solo_preventivo && !comoGerencia &&
              (casosApertura.length > 0 ? (
                <AperturaServicioCaso casos={casosApertura} direccionSugerida={cuenta.direccion as string | null} />
              ) : (
                <Link
                  href={`/postventa/casos/nuevo?cuenta=${cuenta.id}`}
                  title="La apertura de servicio sale de un caso: regístrelo y emítala desde el caso («Apertura de servicio»)"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                >
                  <ClipboardList className="size-3.5" /> Apertura de servicio
                </Link>
              ))}
            <MasAcciones>
              {!comoGerencia && !comoCentral && <VisitaPlantaBoton cuentaId={cuenta.id} empresa={cuenta.razon_social} ruc={cuenta.num_doc as string | null} compacto />}
              {haceCasos && !comoGerencia && <AperturaLlamadaBoton cuentaId={cuenta.id} tipo="atencion_in_situ" etiqueta="Derivar llamada" compacto />}
              {haceCasos && !perfil.solo_preventivo && !comoGerencia && <TraerPedidoAntiguoBoton cuentaId={cuenta.id} compacto />}
              {esArea && !comoGerencia && <OfrecerMantenimientoBoton cuentaId={cuenta.id} compacto />}
              {/* Otra razón social del mismo cliente (28-09): «que lo permita hacer el comercial». */}
              {(cuenta.comercial_id === perfil.id || comoGerencia || perfil.rol === "central") && (
                <VincularRazonSocial cuentaId={cuenta.id} razonSocial={cuenta.razon_social} />
              )}
              <Link
                href={comoCentral ? `/central/clientes/${cuenta.id}?hoy=1` : comoGerencia ? `/gerencia/clientes/${cuenta.id}?hoy=1` : `/comercial/cartera/${cuenta.id}?hoy=1`}
                className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:underline"
              >
                Vista anterior de la ficha
              </Link>
            </MasAcciones>
          </div>
        </div>

        {/* Los cinco números en UNA línea (17-10): eran cinco cuadros de 55 px
            y, en un cliente sin pedidos ni equipos, cuatro decían 0 en el
            mejor lugar de la pantalla. Lo que pide atención va en granate. */}
        <div className="mt-3 flex flex-wrap items-center gap-y-1 border-t border-border pt-2.5 text-xs">
          {chips.map((c, i) => (
            <span key={c.tab + i} className="inline-flex items-center">
              {i > 0 && <span className="mx-1.5 text-muted-foreground/50">·</span>}
              <Link
                href={`?tab=${c.tab}`}
                className={cn(
                  "rounded px-1 py-0.5 transition-colors hover:bg-accent",
                  c.alerta ? "font-semibold text-primary" : c.vacio ? "text-muted-foreground" : "text-foreground",
                )}
              >
                <b className="tabular-nums">{c.valor}</b> {c.etiqueta}
              </Link>
            </span>
          ))}
        </div>
      </div>

      <FijaBajoCabecera className="-mx-1">
      <nav
        className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card/95 px-2 shadow-sm backdrop-blur"
        aria-label="Pestañas de la ficha"
      >
        {PESTANAS.map((p) => (
          <Link
            key={p.clave}
            href={`?tab=${p.clave}`}
            aria-current={p.clave === pestana ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              p.clave === pestana ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {p.etiqueta}
          </Link>
        ))}
      </nav>
      </FijaBajoCabecera>

      <div className="pt-2">
        {pestana === "resumen" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-4">
              {/* GERENCIA 20-10 (Beneficencia, con Brenda PV2): para postventa
                  lo primero son los pedidos y casos abiertos, a un clic —antes
                  había que pasar por el expediente para llegar al pedido—. */}
              {esArea && <PendientesDelCliente cuentaId={cuenta.id} conEnlace={esArea} />}
              <ExpedientesVivos cuentaId={cuenta.id} vivas={vivas} verPrecios={verPrecios} conAnotar={anotaGestion} derivacionPorExpediente={derivacionPorExpediente} />
              {siguiente && (
                <EnlaceOFila href={enlaceExpediente(siguiente.id)} className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Lo que sigue con este cliente</p>
                    <p className="text-base font-semibold text-foreground">{siguiente.proxima_accion ?? "Seguimiento"}</p>
                    <p className="text-xs text-muted-foreground">{fechaAgendada(siguiente.proxima_accion_at, siguiente.proxima_accion_hora)}</p>
                  </div>
                  {enlaceExpediente(siguiente.id) && <ArrowRight className="size-5 text-primary" />}
                </EnlaceOFila>
              )}
              <UltimosCierres informes={informes ?? []} />
              {/* Editable, como en la ficha de siempre (auditoría 25-09). */}
              <ResumenCuenta cuentaId={cuenta.id} notasIniciales={cuenta.notas} soloLectura={comoCentral} />
              <UltimoHistorial cuentaId={cuenta.id} verPrecios={verPrecios} />
            </div>
            <div className="space-y-4">
              {!esArea && <PendientesDelCliente cuentaId={cuenta.id} conEnlace={esArea} />}
              {/* El chat de Mi cuenta en efameinsa.com (0528, Santos 17-10). */}
              <MensajesMiCuenta cuentaId={cuenta.id} siempre />
              <InformesTecnicosDelCliente cuentaId={cuenta.id} conEnlace={abreInformes} />
              <CorreosDeCampana cuentaId={cuenta.id} verTodo={`/nuevo/cliente/${cuenta.id}?tab=correos`} />
            </div>
          </div>
        )}

        {pestana === "pedidos" && (
          <div className="max-w-3xl space-y-4">
            <ExpedientesVivos cuentaId={cuenta.id} vivas={vivas} verPrecios={verPrecios} conAnotar={anotaGestion} derivacionPorExpediente={derivacionPorExpediente} />
            <PendientesDelCliente cuentaId={cuenta.id} conEnlace={esArea} />
            <InformesTecnicosDelCliente cuentaId={cuenta.id} conEnlace={abreInformes} />
            {(pedidosAbiertos ?? 0) + (casosAbiertos ?? 0) === 0 && (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No hay pedidos ni casos técnicos abiertos con este cliente. Lo cerrado está en «Ventas» e «Historial».
              </p>
            )}
          </div>
        )}

        {pestana === "equipos" && (
          <div className="max-w-4xl space-y-3">
            {(equipos ?? 0) > 0 ? (
              <EquiposDelCliente cuentaId={cuenta.id} />
            ) : (
              // UN VACÍO QUE DICE POR QUÉ Y OFRECE LA SALIDA (17-10). Decía
              // «entran cuando se cierra un pedido» a quien tenía la placa de
              // la LG en la mano (INVERSIONES TURÍSTICAS ALEGRÍA, 16-10): la
              // máquina que no compraron acá, o que es de antes del CRM, no
              // entra sola.
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                <p className="font-medium text-foreground">No hay equipos registrados de este cliente.</p>
                <p className="mt-1">
                  Entran solos cuando se cierra un pedido con su serie. Si el cliente ya tiene una máquina —comprada antes del CRM o en otro lado—,
                  regístrela{haceCasos ? " abajo" : " desde postventa"}; la foto de la placa puede llegar después.
                </p>
              </div>
            )}
            {haceCasos && !comoGerencia && (
              <details className="rounded-xl border border-border bg-card shadow-sm" open={!equipos}>
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-primary hover:underline [&::-webkit-details-marker]:hidden">
                  + Registrar un equipo de este cliente
                </summary>
                <div className="border-t border-border p-4">
                  <FicharMaquina cuenta={{ id: cuenta.id, razonSocial: cuenta.razon_social }} />
                </div>
              </details>
            )}
          </div>
        )}

        {pestana === "ventas" && (
          <PestanaVentas cuentaId={cuenta.id} informes={informes ?? []} ops={ops} verPrecios={verPrecios} quienMira={perfil.id} comoGerencia={comoGerencia} derivacionPorExpediente={derivacionPorExpediente} />
        )}

        {pestana === "documentos" && (
          <div className="max-w-4xl space-y-4">
            <InformesTecnicosDelCliente cuentaId={cuenta.id} conEnlace={abreInformes} />
            <DocumentosDelServidor
              cuentaId={cuenta.id}
              razonSocial={cuenta.razon_social}
              nombreComercial={cuenta.nombre_comercial as string | null}
              carpetas={cuenta.carpetas_servidor as Record<string, string> | null}
              soloLectura={comoCentral}
            />
            <GrupoEconomico cuentaId={cuenta.id} comoGerencia={comoGerencia} baseHref={comoCentral ? "/central/clientes" : undefined} />
          </div>
        )}

        {pestana === "historial" && <HistorialCompleto cuentaId={cuenta.id} verPrecios={verPrecios} />}

        {pestana === "llamadas" && <LlamadasDelCliente cuentaId={cuenta.id} comoPestana />}

        {pestana === "correos" && <HistorialCorreosDeCampana cuentaId={cuenta.id} />}

        {pestana === "contactos" && (
          <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="text-[13px] font-bold uppercase tracking-wide text-foreground">Datos del cliente</p>
              <IdentidadCuenta
                cuentaId={cuenta.id}
                tipoDoc={cuenta.tipo_doc}
                numDoc={cuenta.num_doc}
                razonSocial={cuenta.razon_social}
                rubroId={(cuenta.rubro_id as number | null) ?? null}
                rubros={(rubros ?? []) as { id: number; nombre: string }[]}
                abrirAlEntrar={corregir === "1"}
                soloLectura={comoCentral}
              />
              {!comoCentral && (rubros ?? []).length > 0 && (
                <CambiarRubro
                  cuentaId={cuenta.id}
                  rubroId={(cuenta.rubro_id as number | null) ?? null}
                  rubros={(rubros ?? []) as { id: number; nombre: string }[]}
                  puedeAgregar={puedeCrearRubros}
                />
              )}
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="mb-2 text-[13px] font-bold uppercase tracking-wide text-foreground">Contactos ({contactos.length})</p>
              <ContactosEditables cuentaId={cuenta.id} contactos={contactos} soloLectura={comoCentral} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type ExpedienteVivo = {
  id: string; etapa: string; tipo_postventa: string | null; proxima_accion: string | null; proxima_accion_at: string | null;
  proxima_accion_hora: string | null; perfiles: { nombre: string; codigo_comercial: string | null } | null;
  /** Si es de otra empresa del grupo, cuál (17-10). */
  empresa?: { id: string; razon_social: string };
};

/** «Mantenimiento preventivo · Cotizada»: cómo se nombra un expediente fuera de su pantalla. */
function etiquetaExpediente(o: { tipo_postventa: string | null; etapa: string }) {
  const etapa = o.etapa.charAt(0).toUpperCase() + o.etapa.slice(1).replace(/_/g, " ");
  return `${etiquetaTipoExpediente(o.tipo_postventa)} · ${etapa}`;
}

const ESTADO_COTIZACION: Record<string, string> = {
  borrador: "borrador",
  enviada: "confirmada",
  aceptada: "aceptada",
  perdida: "perdida",
  vencida: "vencida",
};
const APROBACION: Record<string, { texto: string; clases: string }> = {
  pendiente_gerencia: { texto: "espera a gerencia", clases: "bg-amber-500/10 text-amber-800" },
  aprobada_gerencia: { texto: "aprobada por gerencia", clases: "bg-[#1E7F4F]/10 text-[#1E7F4F]" },
  auto_aprobada: { texto: "aprobada", clases: "bg-[#1E7F4F]/10 text-[#1E7F4F]" },
  rechazada_gerencia: { texto: "rechazada por gerencia", clases: "bg-destructive/10 text-destructive" },
};

/**
 * LOS EXPEDIENTES VIVOS, CADA UNO CON SU TIPO (gerencia, 28-09). Carlos, en la
 * ficha de MINERÍA SINGULARIDAD: «yo solamente quiero ver los dos expedientes
 * vivos, y de los dos, uno entiendo que debe ser el macro y otro el problema de
 * mantenimiento». Antes el número llevaba a la pestaña de ventas, con todos los
 * expedientes mezclados y sin decir de qué era cada uno.
 *
 * 17-10 (Ariana PV3): la fila dice también lo que antes solo decía el
 * expediente —en qué va la cotización y qué fue lo último que se habló—. En
 * INVERSIONES TURÍSTICAS ALEGRÍA la cotización aprobada y confirmada solo
 * asomaba como una fila del historial, bajo el pliegue.
 */
async function ExpedientesVivos({
  cuentaId,
  vivas: propias,
  verPrecios,
  conAnotar,
  derivacionPorExpediente,
}: {
  cuentaId: string;
  vivas: ExpedienteVivo[];
  verPrecios: boolean;
  conAnotar: boolean;
  /** Solo Central: expediente → su derivación (ver derivacionesDeExpedientes). */
  derivacionPorExpediente: Map<string, string> | null;
}) {
  const supabase = await createClient();
  // LOS DEL GRUPO TAMBIÉN (17-10, Ariana PV3). Una cadena de hoteles factura
  // con varias razones sociales: la garantía de HOTELERA CUSCO (cotización
  // Presu_1129-26) no se veía desde TURISMO COSTA DEL SOL, la empresa madre,
  // y ella creía que el cliente no estaba en el CRM. Cada fila dice de qué
  // empresa es; los permisos de siempre deciden cuáles se ven.
  const { data: grupo } = await supabase.rpc("grupo_economico", { p_cuenta_id: cuentaId });
  const otras = ((grupo ?? []) as { id: string; razon_social: string; es_esta: boolean }[]).filter((g) => !g.es_esta);
  const { data: delGrupo } = otras.length
    ? await supabase
        .from("oportunidades")
        .select("id, etapa, tipo_postventa, proxima_accion, proxima_accion_at, proxima_accion_hora, cuenta_id, lead_id, perfiles:comercial_id(nombre, codigo_comercial)")
        .in("cuenta_id", otras.map((g) => g.id))
        .is("cerrada_at", null)
        .not("etapa", "in", "(venta,rechazada,derivada,historico)")
        .limit(30)
    : { data: [] };
  const vivas: ExpedienteVivo[] = [
    ...propias,
    ...((delGrupo ?? []) as unknown as (ExpedienteVivo & { cuenta_id: string })[]).map((o) => {
      const g = otras.find((x) => x.id === o.cuenta_id)!;
      return { ...o, empresa: { id: g.id, razon_social: g.razon_social } };
    }),
  ];
  if (vivas.length === 0) return null;
  const deOtras = vivas.length - propias.length;
  // Los del grupo también se abren por su derivación, si Central es quien mira.
  const derivaciones =
    derivacionPorExpediente && deOtras > 0
      ? new Map([...derivacionPorExpediente, ...(await derivacionesDeExpedientes(vivas.slice(propias.length) as { id: string; lead_id?: string | null }[]))])
      : derivacionPorExpediente;
  const ids = vivas.map((o) => o.id);
  const [{ data: cotizaciones }, { data: gestiones }, { data: casosDentro }] = await Promise.all([
    supabase
      .from("cotizaciones")
      .select("oportunidad_id, codigo, estado, estado_aprobacion, total, moneda, created_at")
      .in("oportunidad_id", ids)
      .is("anulada_at", null)
      .neq("estado", "anulada")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("actividades")
      .select("oportunidad_id, tipo, nota, realizada_at, perfiles:realizada_por(nombre, codigo_comercial)")
      .in("oportunidad_id", ids)
      .order("realizada_at", { ascending: false })
      .limit(60),
    // Los casos abiertos de cada carpeta, con su código (gerencia 20-10, Lernake:
    // el mismo caso salía arriba y abajo sin que se supiera que era uno solo).
    supabase.from("atenciones").select("id, codigo, tipo, oportunidad_id").in("oportunidad_id", ids).is("cerrado_at", null).limit(60),
  ]);
  const casosDe = new Map<string, { id: string; codigo: string | null; tipo: string }[]>();
  for (const c of (casosDentro ?? []) as { id: string; codigo: string | null; tipo: string; oportunidad_id: string }[]) {
    casosDe.set(c.oportunidad_id, [...(casosDe.get(c.oportunidad_id) ?? []), c]);
  }
  const cotizacionDe = new Map<string, NonNullable<typeof cotizaciones>[number]>();
  for (const c of cotizaciones ?? []) if (!cotizacionDe.has(c.oportunidad_id as string)) cotizacionDe.set(c.oportunidad_id as string, c);
  const gestionDe = new Map<string, NonNullable<typeof gestiones>[number]>();
  for (const g of gestiones ?? []) if (!gestionDe.has(g.oportunidad_id as string)) gestionDe.set(g.oportunidad_id as string, g);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <p className="border-b border-border px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-foreground">
        Expedientes vivos ({vivas.length})
        {deOtras > 0 && (
          <span className="ml-2 text-[11px] font-medium normal-case tracking-normal text-muted-foreground">
            {deOtras} de otra{deOtras === 1 ? "" : "s"} empresa{deOtras === 1 ? "" : "s"} del grupo
          </span>
        )}
      </p>
      <ul className="divide-y divide-border">
        {vivas.map((o) => {
          const cot = cotizacionDe.get(o.id);
          const ges = gestionDe.get(o.id);
          const autor = ges?.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
          const aprob = cot?.estado_aprobacion ? APROBACION[cot.estado_aprobacion as string] : null;
          const href = enlaceDelExpediente(o.id, derivaciones);
          return (
            <li key={o.id}>
              <EnlaceOFila href={href} className="block space-y-1.5 px-4 py-3 transition-colors hover:bg-accent">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <TipoExpedienteBadge tipo={o.tipo_postventa} grande />
                  <EtapaBadge etapa={o.etapa} />
                  {o.empresa && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">
                      <Building2 className="size-3" /> {o.empresa.razon_social}
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {o.perfiles ? `${o.perfiles.codigo_comercial ?? ""} ${o.perfiles.nombre}`.trim() : "sin dueño"}
                  </span>
                  {href ? (
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                      {derivaciones ? "Ver la derivación" : "Abrir expediente"} <ArrowRight className="size-3.5" />
                    </span>
                  ) : (
                    <span className="ml-auto text-[11px] text-muted-foreground">del archivo, sin derivación</span>
                  )}
                </div>
                {cot && (
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-foreground">
                    <FileText className="size-3.5 text-muted-foreground" />
                    <span className="font-medium">Cotización {cot.codigo ?? ""}</span>
                    {verPrecios && cot.total != null && (
                      <span className="tabular-nums text-muted-foreground">
                        · {cot.moneda} {Number(cot.total).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    )}
                    <span className="text-muted-foreground">· {ESTADO_COTIZACION[cot.estado as string] ?? cot.estado}</span>
                    {aprob && <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", aprob.clases)}>{aprob.texto}</span>}
                  </p>
                )}
                {(casosDe.get(o.id) ?? []).length > 0 && (
                  <p className="text-xs text-foreground">
                    <span className="font-medium">Casos abiertos en esta carpeta:</span>{" "}
                    {(casosDe.get(o.id) ?? []).map((c) => `${c.codigo ?? "caso"} (${ETIQUETA_TIPO_ATENCION[c.tipo as TipoAtencion] ?? c.tipo})`).join(" · ")}
                  </p>
                )}
                {o.proxima_accion ? (
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-foreground">
                    <CalendarClock className="size-3.5 text-muted-foreground" />
                    <span className="font-medium">{o.proxima_accion}</span>
                    <span className="text-muted-foreground">· {o.proxima_accion_at ? fechaAgendada(o.proxima_accion_at, o.proxima_accion_hora) : "sin fecha"}</span>
                  </p>
                ) : (
                  <p className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800">
                    <CalendarClock className="size-3.5" /> Sin próxima acción{conAnotar ? " — agéndela con «Anotar gestión»" : ""}
                  </p>
                )}
                {ges && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Última gestión</span> · {fechaLima(ges.realizada_at as string)}
                    {autor ? ` · ${autor.codigo_comercial ?? autor.nombre}` : ""}
                    {ges.nota ? ` — ${(ges.nota as string).trim()}` : ""}
                  </p>
                )}
              </EnlaceOFila>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * PARA CENTRAL, LA PUERTA A CADA EXPEDIENTE ES SU DERIVACIÓN (la misma regla
 * que la ficha de siempre, ficha-cuenta.tsx): /comercial/* le está cerrado y
 * /central/derivados/[lead] es su vista de lectura. Se busca por el lead que
 * abrió el expediente y por los que se le sumaron después (0141). Son 50 como
 * máximo, así que el `.in` no revienta la URL.
 */
async function derivacionesDeExpedientes(ops: { id: string; lead_id?: string | null }[]) {
  const mapa = new Map<string, string>();
  for (const o of ops) if (o.lead_id) mapa.set(o.id, o.lead_id);
  const sinLead = ops.filter((o) => !o.lead_id).map((o) => o.id);
  if (sinLead.length > 0) {
    const supabase = await createClient();
    const { data: sumados } = await supabase.from("leads").select("id, oportunidad_id").in("oportunidad_id", sinLead);
    for (const l of (sumados ?? []) as { id: string; oportunidad_id: string | null }[]) {
      if (l.oportunidad_id && !mapa.has(l.oportunidad_id)) mapa.set(l.oportunidad_id, l.id);
    }
  }
  return mapa;
}

/** Adónde lleva un expediente: al expediente o —para Central— a su derivación, si la tiene. */
function enlaceDelExpediente(id: string, derivaciones: Map<string, string> | null): string | null {
  if (!derivaciones) return `/comercial/oportunidades/${id}`;
  const lead = derivaciones.get(id);
  return lead ? `/central/derivados/${lead}` : null;
}

/** Un enlace que lleva a un portazo es peor que ningún enlace: sin destino, la fila se lee igual. */
function EnlaceOFila({ href, className, children }: { href: string | null; className: string; children: React.ReactNode }) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

async function UltimoHistorial({ cuentaId, verPrecios }: { cuentaId: string; verPrecios: boolean }) {
  const supabase = await createClient();
  const { eventos } = await cargarHistorialCuenta(supabase, cuentaId, { sinMontos: !verPrecios });
  const ultimos = eventos.slice(0, 5);
  if (ultimos.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-[13px] font-bold uppercase tracking-wide text-foreground">Lo último que pasó</p>
        <Link href="?tab=historial" className="text-[11px] font-medium text-primary hover:underline">
          Todo el historial →
        </Link>
      </div>
      <div className="p-2">
        <HistorialCuenta eventos={ultimos} />
      </div>
    </div>
  );
}

async function HistorialCompleto({ cuentaId, verPrecios }: { cuentaId: string; verPrecios: boolean }) {
  const supabase = await createClient();
  const { eventos } = await cargarHistorialCuenta(supabase, cuentaId, { sinMontos: !verPrecios });
  return (
    <div className="max-w-5xl rounded-xl border border-border bg-card p-2 shadow-sm">
      <HistorialCuenta eventos={eventos} />
    </div>
  );
}

async function PestanaVentas({
  cuentaId,
  informes,
  ops,
  verPrecios,
  quienMira,
  comoGerencia,
  derivacionPorExpediente,
}: {
  quienMira: string;
  comoGerencia: boolean;
  derivacionPorExpediente: Map<string, string> | null;
  cuentaId: string;
  informes: { id: string; codigo: string | null; serie: string | null; fecha: string | null; monto_total: number | null; moneda: string | null; emitido_at: string | null; adjuntos: unknown; anulado_at?: string | null }[];
  ops: {
    id: string; etapa: string; tipo_postventa: string | null; intencion: string | null; proxima_accion: string | null; proxima_accion_at: string | null; cerrada_at: string | null;
    monto_estimado: number | null; moneda: string; comercial_id: string | null; perfiles: { nombre: string; codigo_comercial: string | null } | null;
  }[];
  verPrecios: boolean;
}) {
  const supabase = await createClient();
  const adjuntos = await firmarAdjuntosDeCierres(supabase, informes as Parameters<typeof firmarAdjuntosDeCierres>[1]);
  const { ventasConDetalle } = await cargarHistorialCuenta(supabase, cuentaId, { sinMontos: !verPrecios });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* La lista de la ficha de siempre (auditoría 25-09): de quién es cada
          expediente, su monto, y «trabajar» los del histórico. */}
      <div className="self-start">
        <SeccionPanel titulo={`Expedientes (${ops.length})`}>
          <ListaOportunidadesCuenta oportunidades={[...ops].sort((a, b) => rangoOportunidad(a) - rangoOportunidad(b))} quienMira={quienMira} comoGerencia={comoGerencia} derivacionPorExpediente={derivacionPorExpediente} />
        </SeccionPanel>
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[13px] font-bold uppercase tracking-wide text-foreground">Cierres</p>
            {!derivacionPorExpediente && <AccionNuevoInforme cuentaId={cuentaId} />}
          </div>
          <ListaInformesCierre informes={informes as Parameters<typeof ListaInformesCierre>[0]["informes"]} adjuntosPorInforme={adjuntos} sinPrecios={!verPrecios} conCifras={verPrecios ? undefined : await cierresDePostventa(supabase, informes.map((i) => i.id))} />
        </div>
      </div>
      {ventasConDetalle.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm lg:col-span-2">
          <p className="mb-2 text-[13px] font-bold uppercase tracking-wide text-foreground">Compras anteriores</p>
          <TablaComprasAnteriores ventas={ventasConDetalle} />
        </div>
      )}
    </div>
  );
}
