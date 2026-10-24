import { MensajesMiCuenta } from "@/components/crm/mensajes-mi-cuenta";
import { VolverALaLista } from "@/components/crm/volver-a-la-lista";
import Link from "@/components/enlace";
import { notFound } from "next/navigation";
import { Building2, ClipboardList, FileText, MapPin, Pencil, UserRound } from "lucide-react";
import { etiquetaTipoExpediente } from "@/lib/tipo-expediente";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { puedeVerPrecios, veTodoPostventa } from "@/lib/postventa";
import { cargarHistorialCuenta } from "@/lib/historial-cuenta";
import { firmarAdjuntosDeCierres } from "@/lib/adjuntos-cierre";
import { fechaLima, fechaCalendario } from "@/lib/fechas";
import { cn } from "@/lib/utils";
import { guardaFichaCliente } from "@/lib/propuesta/guardas";
import { AbiertoConElCliente } from "@/components/crm/abierto-con-el-cliente";
import { AperturasDelCliente } from "@/components/crm/aperturas-del-cliente";
import { UltimosCierres } from "@/components/crm/ultimos-cierres";
import { EquiposDelCliente } from "@/components/crm/equipos-del-cliente";
import { FicharMaquina } from "@/components/crm/fichar-maquina";
import { HistorialCuenta } from "@/components/crm/historial-cuenta";
import { ListaInformesCierre, TablaComprasAnteriores } from "@/components/crm/secciones-cliente";
import { AperturaLlamadaBoton } from "@/components/crm/apertura-llamada-boton";
import { VisitaPlantaBoton } from "@/components/crm/visita-planta-boton";
import { AnotarGestionPanel } from "@/components/crm/anotar-gestion-panel";
import { MasAcciones } from "@/components/crm/mas-acciones";
import { DerivarAAreaBoton } from "@/components/crm/derivar-a-area-boton";
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
import { UnirConOtraFicha } from "@/components/crm/unir-con-otra-ficha";
import { cargarSupervisores } from "@/lib/supervisores";
import { CambiarRubro } from "@/components/crm/cambiar-rubro";
import { DocumentosDelServidor } from "@/components/crm/documentos-del-servidor";
import { OfrecerMantenimientoBoton } from "@/components/crm/ofrecer-mantenimiento-boton";
import { TraerPedidoAntiguoBoton } from "@/components/crm/traer-pedido-antiguo-boton";
import { ListaOportunidadesCuenta, rangoOportunidad } from "@/components/crm/ficha-cuenta";
import { AnotarClienteReciente } from "@/components/crm/clientes-recientes";
import { InformesTecnicosDelCliente } from "@/components/crm/informes-tecnicos-del-cliente";
import { cierresDePostventa } from "@/lib/precios-postventa";
import { VincularRazonSocial } from "@/components/crm/vincular-razon-social";
import { tituloDelTipo, type TipoAtencion } from "@/lib/atenciones";
import { AperturaServicioCaso, type CasoParaApertura } from "@/components/crm/apertura-servicio-caso";
import { CorreosDeCampana, HistorialCorreosDeCampana } from "@/components/crm/correos-de-campana";
import { LlamadasDelCliente } from "@/components/crm/llamadas-del-cliente";
import { BotonLlamar } from "@/components/crm/boton-llamar";

export const dynamic = "force-dynamic";

// REDISEÑO 23-10: las cinco de todos los días primero y las de consulta después,
// todas en una fila (Santos 23-10 17:10: «¿tiene que estar ese botón Más? ¿no entra
// todo?»). Las de consulta llevan nombre corto para que quepan en HD.
const PESTANAS = [
  { clave: "resumen", etiqueta: "Resumen" },
  { clave: "pedidos", etiqueta: "Pedidos y casos" },
  { clave: "equipos", etiqueta: "Equipos" },
  { clave: "historial", etiqueta: "Historial" },
  { clave: "contactos", etiqueta: "Datos y contactos" },
  { clave: "ventas", etiqueta: "Ventas" },
  { clave: "llamadas", etiqueta: "Llamadas" },
  { clave: "correos", etiqueta: "Correos" },
  { clave: "documentos", etiqueta: "Documentos" },
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
    supabase.from("catalogo_resultados_gestion").select("id, codigo, nombre, accion_sugerida, dias_sugeridos, efecto, solo_postventa").eq("activo", true).order("orden"),
    supabase.from("catalogo_motivos_rechazo").select("id, nombre, solo_postventa, requiere_nota").eq("activo", true).order("nombre"),
  ]);
  const [
    { count: pedidosAbiertos },
    { count: equipos },
    { count: casosAbiertos },
    { data: informes },
    { data: oportunidades },
    { data: casosSinApertura },
    { count: llamadasGrabadas },
    { count: correosCampana },
    { count: informesTecnicos },
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
    // Cuántas hay en las pestañas de consulta, para que la pestaña lo diga
    // antes de abrirla (rediseño 23-10).
    supabase.from("llamadas").select("id", { count: "exact", head: true }).eq("cuenta_id", id),
    supabase.from("correos_campana_recibidos").select("id", { count: "exact", head: true }).eq("cuenta_id", id),
    supabase.from("informes_servicio").select("id", { count: "exact", head: true }).eq("cuenta_id", id),
  ]);
  const dueno = cuenta.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
  // Para «Unir con otra ficha» (0558): a quién pedirle el código si hace falta.
  const supervisoresUnion = await cargarSupervisores(supabase);
  const fichaParaUnir = {
    id: cuenta.id,
    razonSocial: cuenta.razon_social,
    documento: cuenta.tipo_doc !== "SIN_DOC" ? (cuenta.num_doc as string | null) : null,
    comercial: dueno ? `${dueno.codigo_comercial ? dueno.codigo_comercial + " " : ""}${dueno.nombre}` : null,
  };
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
    { etiqueta: plural(vivas.length, "carpeta abierta", "carpetas abiertas"), valor: String(vivas.length), tab: "resumen", vacio: vivas.length === 0 },
    // Rótulos que dicen qué cuentan (gerencia 20-10: «¿qué es pedido abierto?»):
    // el pedido es lo que se entrega; el caso, lo que el cliente pidió o reclamó.
    { etiqueta: plural(pedidosAbiertos ?? 0, "pedido por entregar o cerrar", "pedidos por entregar o cerrar"), valor: String(pedidosAbiertos ?? 0), tab: "pedidos", alerta: (pedidosAbiertos ?? 0) > 0, vacio: !pedidosAbiertos },
    { etiqueta: plural(casosAbiertos ?? 0, "caso abierto (CASO-…)", "casos abiertos (CASO-…)"), valor: String(casosAbiertos ?? 0), tab: "pedidos", alerta: (casosAbiertos ?? 0) > 0, vacio: !casosAbiertos },
    { etiqueta: plural(equipos ?? 0, "equipo", "equipos"), valor: String(equipos ?? 0), tab: "equipos", vacio: !equipos },
    { etiqueta: "última venta", valor: cuenta.ultima_venta_at ? fechaCalendario(cuenta.ultima_venta_at) : "nunca", tab: "ventas", vacio: !cuenta.ultima_venta_at },
  ];
  // Quién anota desde la ficha: postventa en el expediente del área; el
  // comercial, solo en su cartera (las mismas reglas que «Registrar seguimiento»).
  const anotaGestion = !comoGerencia && !comoCentral && (haceCasos || cuenta.comercial_id === perfil.id);
  const conteoPestana: Partial<Record<(typeof PESTANAS)[number]["clave"], number>> = {
    pedidos: (pedidosAbiertos ?? 0) + (casosAbiertos ?? 0),
    equipos: equipos ?? 0,
    ventas: (informes ?? []).length,
    llamadas: llamadasGrabadas ?? 0,
    correos: correosCampana ?? 0,
    documentos: (informesTecnicos ?? 0) + Object.keys((cuenta.carpetas_servidor as Record<string, string> | null) ?? {}).length,
  };
  const puedeDerivar = haceCasos && !comoGerencia && !comoCentral && !perfil.solo_preventivo;
  const casoUnico = casosApertura.length === 1 ? casosApertura[0].id : null;

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
                <Pencil className="size-3" /> Corregir nombre, RUC o dirección
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
            {/* Central abre un caso para Finanzas o Facturación (0573, Santos 21-10). */}
            {comoCentral && <DerivarAAreaBoton cuentaId={cuenta.id} cliente={cuenta.razon_social} compacto />}
            <MasAcciones>
              {!comoGerencia && !comoCentral && <VisitaPlantaBoton cuentaId={cuenta.id} empresa={cuenta.razon_social} ruc={cuenta.num_doc as string | null} compacto />}
              {/* La llamada cuelga del caso (rediseño 23-10): si hay uno solo abierto, va con él. */}
              {haceCasos && !comoGerencia && <AperturaLlamadaBoton cuentaId={cuenta.id} atencionId={casoUnico} tipo="atencion_in_situ" etiqueta="Derivar llamada al almacén" compacto />}
              {haceCasos && !perfil.solo_preventivo && !comoGerencia && <TraerPedidoAntiguoBoton cuentaId={cuenta.id} compacto />}
              {esArea && !comoGerencia && <OfrecerMantenimientoBoton cuentaId={cuenta.id} compacto />}
              {/* Otra razón social del mismo cliente (28-09): «que lo permita hacer el comercial». */}
              {(cuenta.comercial_id === perfil.id || comoGerencia || perfil.rol === "central") && (
                <VincularRazonSocial cuentaId={cuenta.id} razonSocial={cuenta.razon_social} />
              )}
              {/* 0558 (Katerine 20-10): el mismo cliente con dos fichas se une desde acá, buscando la otra. */}
              {!cuenta.fusionada_en && <UnirConOtraFicha variante="enlace" cuenta={fichaParaUnir} supervisores={supervisoresUnion} className="rounded-md px-2 py-1 text-[11px]" />}
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
            {conteoPestana[p.clave] != null && (
              <span className={cn("ml-1.5 rounded-full px-1.5 py-px text-[11px] font-bold tabular-nums", conteoPestana[p.clave] ? "bg-secondary text-foreground" : "text-muted-foreground/60")}>
                {conteoPestana[p.clave]}
              </span>
            )}
          </Link>
        ))}
      </nav>
      </FijaBajoCabecera>

      <div className="pt-2">
        {pestana === "resumen" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-4">
              {/* GERENCIA 20-10 (Beneficencia, con Brenda PV2): para postventa
                  lo primero son los pedidos y casos abiertos, a un clic.
                  REDISEÑO 23-10: «Pendiente con este cliente», «Expedientes
                  vivos» y «Lo que sigue» eran tres paneles de lo mismo; ahora es
                  UNO, la carpeta con lo que cuelga de ella. */}
              <AbiertoConElCliente
                cuentaId={cuenta.id}
                vivas={vivas}
                verPrecios={verPrecios}
                conAnotar={anotaGestion}
                conEnlace={esArea}
                puedeDerivar={puedeDerivar}
                derivacionPorExpediente={derivacionPorExpediente}
              />
              {vivas.length === 0 && !siguiente && (
                <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
                  No hay carpeta abierta con este cliente. Si llama por algo nuevo, «Registrar un caso» abre la carpeta y el caso en un paso.
                </p>
              )}
              <UltimosCierres informes={informes ?? []} />
              {/* Editable, como en la ficha de siempre (auditoría 25-09). */}
              <ResumenCuenta cuentaId={cuenta.id} notasIniciales={cuenta.notas} soloLectura={comoCentral} />
              <UltimoHistorial cuentaId={cuenta.id} verPrecios={verPrecios} />
            </div>
            <div className="space-y-4">
              {/* Las aperturas a la derecha (gerencia 20-10: «esta es la ficha total del cliente»). */}
              {esArea && <AperturasDelCliente cuentaId={cuenta.id} />}
              {/* Los informes técnicos solo cuando hay (rediseño 23-10): un «(0)»
                  con su explicación ocupaba la mejor parte de la columna. */}
              {(informesTecnicos ?? 0) > 0 && <InformesTecnicosDelCliente cuentaId={cuenta.id} conEnlace={abreInformes} />}
              {/* El chat de Mi cuenta en efameinsa.com (0528, Santos 17-10): se
                  muestra siempre, pero plegado cuando no hay mensajes. */}
              <details className="rounded-xl border border-border bg-card shadow-sm" open={false}>
                <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-foreground [&::-webkit-details-marker]:hidden">
                  Mensajes de Mi cuenta <span className="ml-1 text-[11px] font-medium normal-case tracking-normal text-muted-foreground">· el chat del cliente en efameinsa.com</span>
                </summary>
                <div className="border-t border-border">
                  <MensajesMiCuenta cuentaId={cuenta.id} siempre />
                </div>
              </details>
              <CorreosDeCampana cuentaId={cuenta.id} verTodo={`/nuevo/cliente/${cuenta.id}?tab=correos`} />
            </div>
          </div>
        )}

        {pestana === "pedidos" && (
          <div className="max-w-3xl space-y-4">
            <AbiertoConElCliente
              cuentaId={cuenta.id}
              vivas={vivas}
              verPrecios={verPrecios}
              conAnotar={anotaGestion}
              conEnlace={esArea}
              puedeDerivar={puedeDerivar}
              derivacionPorExpediente={derivacionPorExpediente}
            />
            {(informesTecnicos ?? 0) > 0 && <InformesTecnicosDelCliente cuentaId={cuenta.id} conEnlace={abreInformes} />}
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
                direccion={(cuenta.direccion as string | null) ?? null}
                rubroId={(cuenta.rubro_id as number | null) ?? null}
                rubros={(rubros ?? []) as { id: number; nombre: string }[]}
                abrirAlEntrar={corregir === "1"}
                soloLectura={comoCentral}
              />
              {!cuenta.fusionada_en && <UnirConOtraFicha cuenta={fichaParaUnir} supervisores={supervisoresUnion} />}
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

/** «Mantenimiento preventivo · Cotizada»: cómo se nombra un expediente fuera de su pantalla. */
function etiquetaExpediente(o: { tipo_postventa: string | null; etapa: string }) {
  const etapa = o.etapa.charAt(0).toUpperCase() + o.etapa.slice(1).replace(/_/g, " ");
  return `${etiquetaTipoExpediente(o.tipo_postventa)} · ${etapa}`;
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
