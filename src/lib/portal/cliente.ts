import { createAdminClient } from "@/lib/supabase/admin";
import {
  clasificarArchivo,
  diaComoIso,
  estadoCotizacionCliente,
  etapaCasoCliente,
  nombreDocumento,
  normalizarTelefono,
  pasosDelPedido,
  tipoCasoCliente,
  tipoPedidoCliente,
  tituloPedido,
  validaHasta,
  type ArchivoGuardado,
  type PasoCliente,
  type PedidoParaCliente,
} from "@/lib/portal/traductor";
import { circuitoDe, type ServicioPostventa } from "@/lib/postventa";

/**
 * EL HISTORIAL DEL CLIENTE PARA MI CUENTA (contrato «Experiencia del cliente», 17-10).
 *
 * La web pregunta por un correo o un celular; acá se busca a quién pertenece
 * (los contactos de las fichas vivas y quien recibe un pedido) y se arma el
 * JSON EXACTO del contrato. Se lee con la llave de servicio porque el cliente
 * no tiene usuario en el CRM: por eso cada consulta va filtrada por las
 * fichas de ESE cliente, y nada interno (notas, montos, áreas, estados de la
 * base) sale de este archivo.
 */

type Admin = ReturnType<typeof createAdminClient>;

export interface IdentidadPortal {
  email?: string | null;
  telefono?: string | null;
}

export interface ClienteIdentificado {
  cuentas: { id: string; razon_social: string; num_doc: string | null; comercial_id: string | null }[];
  nombre: string;
  /** Pedidos de otra ficha donde esta persona figura como quien recibe (0525). */
  pedidosComoReceptor: string[];
  /** Los correos de prueba ven también las filas de práctica (es_prueba). */
  incluyePrueba: boolean;
}

export interface RespuestaPortal {
  ok: true;
  cliente: { nombre: string; empresas: { id: string; razon_social: string; num_doc: string }[] };
  asesor: { nombre: string; celular: string; correo: string } | null;
  cotizaciones: {
    id: string;
    codigo: string;
    fecha: string;
    estado: "enviada" | "aceptada" | "vencida" | "anulada" | "perdida";
    valida_hasta: string | null;
    pdf_url: string | null;
    equipos: string[];
  }[];
  pedidos: {
    id: string;
    codigo: string;
    tipo: "equipo" | "repuesto" | "mantenimiento" | "garantia" | "otro";
    titulo: string;
    creado: string;
    cerrado: string | null;
    pasos: PasoCliente[];
    agencia: { nombre: string; destino: string; fecha: string | null } | null;
    entrega: { direccion: string; fecha_programada: string | null; recibe: string } | null;
    tecnico: string | null;
    instalacion: string | null;
    fotos: { etapa: "protocolo" | "salida" | "agencia" | "recibido" | "puesta_en_marcha"; url: string; nombre: string }[];
    documentos: { nombre: string; url: string }[];
    recibido_cliente_at: string | null;
  }[];
  casos: {
    id: string;
    codigo: string;
    tipo: ReturnType<typeof tipoCasoCliente>;
    equipo: string;
    abierto: string;
    etapa_cliente: ReturnType<typeof etapaCasoCliente>;
    programada: string | null;
    tecnico: string | null;
    tecnico_salio_at: string | null;
    tecnico_llego_at: string | null;
    resuelto: string | null;
    documentos: { nombre: string; url: string }[];
    fotos: { url: string; nombre: string }[];
  }[];
  equipos: { modelo: string; serie: string; instalado: string | null; garantia_hasta: string | null; proximo_mantenimiento: string | null }[];
  mensajes: MensajePortal[];
}

export interface MensajePortal {
  id: string;
  autor: "cliente" | "empresa";
  nombre: string;
  texto: string;
  fecha: string;
  pedido_id: string | null;
  caso_id: string | null;
}

const BUCKET = "adjuntos";
const UNA_HORA = 3600;
const TROZO = 80;

/** Correos de prueba del contrato: ven también lo marcado como práctica. */
export function esIdentidadDePrueba(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return /@efameinsa\.com$/.test(e) || e === "soypuromarketing@gmail.com";
}

function correoValido(e: string): boolean {
  return e.length <= 254 && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(e);
}

/** Para `ilike` exacto: el % y el _ del correo no son comodines. */
function sinComodines(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function trozos<T>(lista: T[], n = TROZO): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < lista.length; i += n) r.push(lista.slice(i, i + n));
  return r;
}

/** Un `.in()` partido en trozos: con muchos ids la URL revienta (memoria del CRM). */
async function enTrozos<T>(ids: string[], consulta: (parte: string[]) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  if (ids.length === 0) return [];
  const partes = await Promise.all(trozos([...new Set(ids)]).map((p) => consulta(p)));
  const filas: T[] = [];
  for (const r of partes) {
    if (r.error) {
      console.error("[portal] consulta", (r.error as { message?: string }).message ?? r.error);
      continue;
    }
    filas.push(...((r.data ?? []) as T[]));
  }
  return filas;
}

/**
 * ¿Quién es? Las fichas vivas (ni archivadas ni unidas a otra) con un contacto
 * de ese correo o ese celular, y los pedidos donde ese celular es quien recibe.
 * null si no hay nadie: la ruta responde siempre el mismo 404.
 */
export async function identificarCliente(admin: Admin, ident: IdentidadPortal): Promise<ClienteIdentificado | null> {
  const email = (ident.email ?? "").trim().toLowerCase();
  const tel = normalizarTelefono(ident.telefono ?? null);
  const conEmail = email && correoValido(email) ? email : null;
  // Menos de 7 dígitos no identifica a nadie (y un «1» calzaría con cualquier fila rota).
  const conTel = tel && tel.length >= 7 && tel.length <= 12 ? tel : null;
  if (!conEmail && !conTel) return null;

  const [porCorreo, porTel] = await Promise.all([
    conEmail
      ? admin.from("contactos").select("cuenta_id, nombre").ilike("email", sinComodines(conEmail)).limit(50)
      : Promise.resolve({ data: [] as { cuenta_id: string; nombre: string }[], error: null }),
    conTel
      ? admin.from("contactos").select("cuenta_id, nombre").eq("telefono_normalizado", conTel).limit(50)
      : Promise.resolve({ data: [] as { cuenta_id: string; nombre: string }[], error: null }),
  ]);
  const contactos = [...((porCorreo.data ?? []) as { cuenta_id: string; nombre: string }[]), ...((porTel.data ?? []) as { cuenta_id: string; nombre: string }[])];
  const idsCuenta = [...new Set(contactos.map((c) => c.cuenta_id).filter(Boolean))];

  const { data: cuentasData } = idsCuenta.length
    ? await admin
        .from("cuentas")
        .select("id, razon_social, num_doc, comercial_id")
        .in("id", idsCuenta)
        .is("fusionada_en", null)
        .is("archivada_at", null)
    : { data: [] };
  const cuentas = (cuentasData ?? []) as ClienteIdentificado["cuentas"];
  const vivas = new Set(cuentas.map((c) => c.id));

  const incluyePrueba = esIdentidadDePrueba(conEmail);
  let pedidosComoReceptor: string[] = [];
  if (conTel) {
    let q = admin.from("servicios_postventa").select("id, cuenta_id").eq("recibe_telefono_normalizado", conTel).limit(50);
    if (!incluyePrueba) q = q.eq("es_prueba", false);
    const { data, error } = await q;
    // Antes de la 0525 la columna no existe: se sigue sin esta búsqueda.
    if (!error) {
      pedidosComoReceptor = ((data ?? []) as { id: string; cuenta_id: string | null }[])
        .filter((p) => !p.cuenta_id || !vivas.has(p.cuenta_id))
        .map((p) => p.id);
    }
  }

  if (cuentas.length === 0 && pedidosComoReceptor.length === 0) return null;
  const contactoDeAca = contactos.find((c) => vivas.has(c.cuenta_id) && c.nombre?.trim());
  return {
    cuentas,
    nombre: contactoDeAca?.nombre.trim() ?? cuentas[0]?.razon_social ?? "Cliente",
    pedidosComoReceptor,
    incluyePrueba,
  };
}

/** ¿Este pedido es de este cliente? Devuelve su ficha (para avisar al dueño) o null. */
export async function pedidoDelCliente(
  admin: Admin,
  cli: ClienteIdentificado,
  pedidoId: string,
): Promise<{ id: string; cuenta_id: string | null; es_prueba: boolean; cliente_texto: string | null; equipo: string | null; recibido_cliente_at: string | null; recibido_cliente_fotos: unknown } | null> {
  if (!esUuid(pedidoId)) return null;
  const { data } = await admin.from("servicios_postventa").select("*").eq("id", pedidoId).maybeSingle();
  if (!data) return null;
  const p = data as { id: string; cuenta_id: string | null; es_prueba?: boolean; cliente_texto: string | null; equipo: string | null; recibido_cliente_at?: string | null; recibido_cliente_fotos?: unknown };
  const deSuFicha = p.cuenta_id != null && cli.cuentas.some((c) => c.id === p.cuenta_id);
  if (!deSuFicha && !cli.pedidosComoReceptor.includes(p.id)) return null;
  if (p.es_prueba && !cli.incluyePrueba) return null;
  return {
    id: p.id,
    cuenta_id: p.cuenta_id,
    es_prueba: p.es_prueba === true,
    cliente_texto: p.cliente_texto,
    equipo: p.equipo,
    recibido_cliente_at: p.recibido_cliente_at ?? null,
    recibido_cliente_fotos: p.recibido_cliente_fotos ?? [],
  };
}

/** ¿Este caso es de este cliente? */
export async function casoDelCliente(admin: Admin, cli: ClienteIdentificado, casoId: string): Promise<{ id: string; cuenta_id: string; es_prueba: boolean } | null> {
  if (!esUuid(casoId)) return null;
  const { data } = await admin.from("atenciones").select("id, cuenta_id, es_prueba").eq("id", casoId).maybeSingle();
  const a = data as { id: string; cuenta_id: string | null; es_prueba: boolean | null } | null;
  if (!a?.cuenta_id || !cli.cuentas.some((c) => c.id === a.cuenta_id)) return null;
  if (a.es_prueba && !cli.incluyePrueba) return null;
  return { id: a.id, cuenta_id: a.cuenta_id, es_prueba: a.es_prueba === true };
}

export function esUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function mensajeParaPortal(m: {
  id: string;
  autor: string;
  autor_nombre: string;
  texto: string;
  created_at: string;
  servicio_id: string | null;
  atencion_id: string | null;
}): MensajePortal {
  return {
    id: m.id,
    autor: m.autor === "empresa" ? "empresa" : "cliente",
    nombre: m.autor_nombre,
    texto: m.texto,
    fecha: m.created_at,
    pedido_id: m.servicio_id,
    caso_id: m.atencion_id,
  };
}

type Archivo = ArchivoGuardado & { path: string };

function archivos(lista: unknown): Archivo[] {
  return (Array.isArray(lista) ? lista : []).filter((f): f is Archivo => Boolean(f && typeof (f as Archivo).path === "string" && (f as Archivo).path));
}

/** Firma todas las rutas de una vez (en trozos), una hora. */
async function firmar(admin: Admin, paths: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(paths.filter(Boolean))];
  const mapa = new Map<string, string>();
  for (const parte of trozos(unicos, 100)) {
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrls(parte, UNA_HORA);
    if (error) {
      console.error("[portal] firmar", error.message);
      continue;
    }
    for (const f of data ?? []) if (f.path && f.signedUrl) mapa.set(f.path, f.signedUrl);
  }
  return mapa;
}

function textoEquipo(e: { modelo_texto?: string | null; productos?: { marca?: string | null; modelo?: string | null; nombre?: string | null } | null }): string {
  const p = e.productos;
  const deCatalogo = p ? [p.nombre, p.marca, p.modelo].filter(Boolean).join(" ") : "";
  return (e.modelo_texto ?? "").trim() || deCatalogo || "Equipo";
}

/** Todo el historial, con la forma exacta del contrato. */
export async function armarRespuestaPortal(admin: Admin, cli: ClienteIdentificado): Promise<RespuestaPortal> {
  const idsCuenta = cli.cuentas.map((c) => c.id);
  const prueba = cli.incluyePrueba ? [true, false] : [false];

  // ── Pedidos ──────────────────────────────────────────────────────────────
  const [pedidosDeFicha, pedidosRecibe] = await Promise.all([
    enTrozos<Record<string, unknown>>(idsCuenta, (parte) =>
      admin.from("servicios_postventa").select("*").in("cuenta_id", parte).in("es_prueba", prueba).order("created_at", { ascending: false }).limit(200),
    ),
    enTrozos<Record<string, unknown>>(cli.pedidosComoReceptor, (parte) =>
      admin.from("servicios_postventa").select("*").in("id", parte).in("es_prueba", prueba).limit(50),
    ),
  ]);
  const vistos = new Set<string>();
  let pedidosCrudos = [...pedidosDeFicha, ...pedidosRecibe].filter((p) => {
    const id = p.id as string;
    if (vistos.has(id)) return false;
    vistos.add(id);
    return true;
  }) as unknown as (PedidoParaCliente & Record<string, unknown>)[];

  // El pedido de un cierre anulado no es del cliente (0490 lo cierra con una nota interna).
  const idsCierre = pedidosCrudos.map((p) => p.informe_cierre_id).filter((x): x is string => typeof x === "string");
  const cierres = await enTrozos<{ id: string; codigo: string | null; anulado_at: string | null }>(idsCierre, (parte) =>
    admin.from("informes_cierre").select("id, codigo, anulado_at").in("id", parte),
  );
  const cierrePorId = new Map(cierres.map((c) => [c.id, c]));
  pedidosCrudos = pedidosCrudos.filter((p) => !(p.informe_cierre_id && cierrePorId.get(p.informe_cierre_id as string)?.anulado_at));
  const idsPedido = pedidosCrudos.map((p) => p.id);

  // ── Casos ────────────────────────────────────────────────────────────────
  const casosCrudos = await enTrozos<Record<string, unknown>>(idsCuenta, (parte) =>
    admin.from("atenciones").select("*").in("cuenta_id", parte).in("es_prueba", prueba).order("solicitado_at", { ascending: false }).limit(200),
  );
  // La puesta en marcha enganchada a un pedido se cuenta dentro del pedido.
  const puestaPorPedido = new Map<string, { programada_at: string | null; tecnico: string | null }>();
  for (const a of casosCrudos) {
    if (a.tipo === "puesta_en_marcha" && typeof a.servicio_id === "string" && !puestaPorPedido.has(a.servicio_id)) {
      puestaPorPedido.set(a.servicio_id, { programada_at: (a.programada_at as string | null) ?? null, tecnico: (a.tecnico as string | null) ?? null });
    }
  }
  const casos = casosCrudos.filter((a) => !(a.tipo === "puesta_en_marcha" && a.servicio_id && vistos.has(a.servicio_id as string)));
  const idsCaso = casos.map((a) => a.id as string);

  // ── Lo que cuelga de pedidos y casos ────────────────────────────────────
  type Informe = { id: string; tipo: string; servicio_id: string | null; atencion_id: string | null; fotos: unknown; documentos: unknown; enviado_at: string | null; emitido_at: string | null; es_prueba: boolean | null };
  const selInforme = "id, tipo, servicio_id, atencion_id, fotos, documentos, enviado_at, emitido_at, es_prueba";
  const [infPedido, infCaso, maquinasPedido, equiposCrudos, oportunidades, mensajesCrudos] = await Promise.all([
    enTrozos<Informe>(idsPedido, (parte) => admin.from("informes_servicio").select(selInforme).in("servicio_id", parte).in("es_prueba", prueba).not("emitido_at", "is", null)),
    enTrozos<Informe>(idsCaso, (parte) => admin.from("informes_servicio").select(selInforme).in("atencion_id", parte).in("es_prueba", prueba).not("emitido_at", "is", null)),
    enTrozos<{ servicio_id: string; protocolo_fotos: unknown }>(idsPedido, (parte) =>
      admin.from("pedido_equipos").select("servicio_id, protocolo_fotos").in("servicio_id", parte),
    ),
    enTrozos<Record<string, unknown>>(idsCuenta, (parte) =>
      admin
        .from("equipos_instalados")
        .select("id, serie, modelo_texto, fecha_puesta_marcha, fecha_despacho, garantia_hasta, proximo_mantenimiento, es_prueba, productos(marca, modelo, nombre)")
        .in("cuenta_id", parte)
        .in("es_prueba", prueba)
        .order("fecha_venta", { ascending: false, nullsFirst: false }),
    ),
    enTrozos<{ id: string }>(idsCuenta, (parte) => admin.from("oportunidades").select("id").in("cuenta_id", parte).limit(500)),
    leerMensajes(admin, idsCuenta, cli.pedidosComoReceptor),
  ]);
  const informes = [...infPedido, ...infCaso.filter((i) => !infPedido.some((x) => x.id === i.id))];

  type Cotizacion = {
    id: string; codigo: string | null; estado: string; anulada_at: string | null; enviada_at: string | null; created_at: string;
    vigencia_dias: number | null; pdf_path: string | null;
    cotizacion_items: { nombre_impreso: string | null; descripcion: string | null; productos: { marca: string | null; modelo: string | null; nombre: string | null } | null }[] | null;
  };
  const cotizacionesCrudas = await enTrozos<Cotizacion>(
    oportunidades.map((o) => o.id),
    (parte) =>
      admin
        .from("cotizaciones")
        .select("id, codigo, estado, anulada_at, enviada_at, created_at, vigencia_dias, pdf_path, cotizacion_items(nombre_impreso, descripcion, productos(marca, modelo, nombre))")
        .in("oportunidad_id", parte)
        .neq("estado", "borrador")
        .order("created_at", { ascending: false })
        .limit(200),
  );

  // ── Firmar todo lo que se va a mostrar, de una vez ──────────────────────
  const rutas: string[] = [];
  for (const p of pedidosCrudos) {
    for (const k of ["protocolo_fotos", "salida_fotos", "agencia_fotos", "recibido_cliente_fotos"]) rutas.push(...archivos(p[k]).map((f) => f.path));
  }
  for (const m of maquinasPedido) rutas.push(...archivos(m.protocolo_fotos).map((f) => f.path));
  for (const i of informes) rutas.push(...archivos(i.fotos).map((f) => f.path), ...archivos(i.documentos).map((f) => f.path));
  for (const c of cotizacionesCrudas) if (c.pdf_path) rutas.push(c.pdf_path);
  const url = await firmar(admin, rutas);

  // ── Pedidos, con la forma del contrato ──────────────────────────────────
  const pedidos: RespuestaPortal["pedidos"] = pedidosCrudos.map((p) => {
    const c = circuitoDe(p as ServicioPostventa);
    const susInformes = informes.filter((i) => i.servicio_id === p.id);
    const documentosAt = susInformes.map((i) => i.enviado_at).filter((x): x is string => Boolean(x)).sort()[0] ?? null;
    const puesta = puestaPorPedido.get(p.id) ?? null;
    const instalacion = puesta?.programada_at ?? (c.esServicio ? diaComoIso(p.fecha_despacho, p.despacho_hora) : null);

    const fotos: RespuestaPortal["pedidos"][number]["fotos"] = [];
    const documentos: { nombre: string; url: string }[] = [];
    const yaDoc = new Set<string>();
    const sumar = (lista: unknown, etapa: RespuestaPortal["pedidos"][number]["fotos"][number]["etapa"], origen: Parameters<typeof nombreDocumento>[1]) => {
      for (const f of archivos(lista)) {
        const u = url.get(f.path);
        if (!u) continue;
        const clase = clasificarArchivo(f);
        if (clase === "foto") fotos.push({ etapa, url: u, nombre: f.nombre ?? "Foto" });
        else if (clase === "documento" && !yaDoc.has(f.path)) {
          yaDoc.add(f.path);
          documentos.push({ nombre: nombreDocumento(f, origen), url: u });
        }
      }
    };
    sumar(p.protocolo_fotos, "protocolo", "protocolo");
    for (const m of maquinasPedido.filter((m) => m.servicio_id === p.id)) sumar(m.protocolo_fotos, "protocolo", "protocolo");
    sumar(p.salida_fotos, "salida", "salida");
    sumar(p.agencia_fotos, "agencia", "agencia");
    sumar(p.recibido_cliente_fotos, "recibido", "salida");
    for (const i of susInformes) {
      const origen = i.tipo === "puesta_en_marcha" ? "puesta_en_marcha" : "informe";
      sumar(i.fotos, "puesta_en_marcha", origen);
      for (const d of archivos(i.documentos)) {
        const u = url.get(d.path);
        if (u && !yaDoc.has(d.path)) {
          yaDoc.add(d.path);
          documentos.push({ nombre: nombreDocumento(d, origen), url: u });
        }
      }
    }

    const porAgencia = p.entrega_modo === "agencia" || p.entrega_en === "agencia" || Boolean(p.agencia_at);
    const enPlanta = c.entregaEnPlanta || p.entrega_modo === "planta";
    const direccion = (p.direccion_final ?? p.direccion_entrega ?? p.ubicacion ?? "").toString().trim();
    const cierre = p.informe_cierre_id ? cierrePorId.get(p.informe_cierre_id as string) : undefined;
    return {
      id: p.id,
      codigo: (p.numero_pedido_erp as string | null) || cierre?.codigo || `PED-${p.id.slice(0, 8).toUpperCase()}`,
      tipo: tipoPedidoCliente(p),
      titulo: tituloPedido(p.equipo),
      creado: (p.created_at as string | null) ?? diaComoIso(p.fecha_confirmacion) ?? new Date(0).toISOString(),
      cerrado: (p.cerrado_at as string | null) ?? null,
      pasos: pasosDelPedido(p, { instalacionProgramada: puesta?.programada_at ?? null, documentosAt }),
      agencia: porAgencia
        ? {
            nombre: ((p.transportista as string | null) ?? (p.transporte as string | null) ?? "").trim(),
            destino: ((p.agencia_destino as string | null) ?? (p.destino_observacion as string | null) ?? "").trim(),
            fecha: (p.agencia_at as string | null) ?? null,
          }
        : null,
      entrega:
        c.esServicio || (!direccion && !p.fecha_despacho && !enPlanta)
          ? null
          : {
              direccion: enPlanta ? "Lo recoge en nuestra planta" : direccion,
              fecha_programada: diaComoIso(p.fecha_despacho, p.despacho_hora),
              recibe: ((p.recibe_nombre as string | null) ?? "").trim(),
            },
      tecnico: ((p.tecnico_asignado as string | null) ?? puesta?.tecnico ?? null) || null,
      instalacion,
      fotos,
      documentos,
      recibido_cliente_at: (p.recibido_cliente_at as string | null) ?? null,
    };
  });

  // ── Equipos ──────────────────────────────────────────────────────────────
  const textoPorEquipo = new Map<string, string>();
  const equipos: RespuestaPortal["equipos"] = equiposCrudos.map((e) => {
    const modelo = textoEquipo(e as Parameters<typeof textoEquipo>[0]);
    const serie = String(e.serie ?? "");
    textoPorEquipo.set(e.id as string, serie ? `${modelo} · serie ${serie}` : modelo);
    return {
      modelo,
      serie,
      instalado: diaComoIso((e.fecha_puesta_marcha as string | null) ?? (e.fecha_despacho as string | null)),
      garantia_hasta: diaComoIso(e.garantia_hasta as string | null),
      proximo_mantenimiento: diaComoIso(e.proximo_mantenimiento as string | null),
    };
  });

  // ── Casos ────────────────────────────────────────────────────────────────
  const casosRespuesta: RespuestaPortal["casos"] = casos.map((a) => {
    const id = a.id as string;
    const etapa = etapaCasoCliente(a as Parameters<typeof etapaCasoCliente>[0]);
    const susInformes = informes.filter((i) => i.atencion_id === id || i.id === a.informe_servicio_id);
    const documentos: { nombre: string; url: string }[] = [];
    const fotos: { url: string; nombre: string }[] = [];
    for (const i of susInformes) {
      for (const d of archivos(i.documentos)) {
        const u = url.get(d.path);
        if (u) documentos.push({ nombre: "Informe de servicio", url: u });
      }
      for (const f of archivos(i.fotos)) {
        const u = url.get(f.path);
        if (!u) continue;
        const clase = clasificarArchivo(f);
        if (clase === "foto") fotos.push({ url: u, nombre: f.nombre ?? "Foto" });
        else if (clase === "documento") documentos.push({ nombre: "Informe de servicio", url: u });
      }
    }
    const resuelto =
      etapa === "resuelto" ? ((a.cerrado_at as string | null) ?? (a.conformidad_at as string | null) ?? (a.atendido_at as string | null) ?? null) : null;
    return {
      id,
      codigo: `CASO-${id.slice(0, 8).toUpperCase()}`,
      tipo: tipoCasoCliente(a.tipo as string),
      equipo: ((a.equipo_texto as string | null) ?? "").trim() || (a.equipo_id ? textoPorEquipo.get(a.equipo_id as string) : undefined) || "Su equipo",
      abierto: a.solicitado_at as string,
      etapa_cliente: etapa,
      programada: (a.programada_at as string | null) ?? null,
      tecnico: ((a.tecnico as string | null) ?? "").trim() || null,
      tecnico_salio_at: (a.tecnico_salio_at as string | null) ?? null,
      tecnico_llego_at: (a.tecnico_llego_at as string | null) ?? null,
      resuelto,
      documentos,
      fotos,
    };
  });

  // ── Cotizaciones ─────────────────────────────────────────────────────────
  const cotizaciones: RespuestaPortal["cotizaciones"] = [];
  for (const c of cotizacionesCrudas) {
    const vale = validaHasta(c);
    const estado = estadoCotizacionCliente(c, vale);
    if (!estado || !c.codigo) continue;
    cotizaciones.push({
      id: c.id,
      codigo: c.codigo,
      fecha: c.enviada_at ?? c.created_at,
      estado,
      valida_hasta: vale,
      pdf_url: c.pdf_path ? (url.get(c.pdf_path) ?? null) : null,
      equipos: (c.cotizacion_items ?? [])
        .map((i) => (i.nombre_impreso ?? "").trim() || [i.productos?.nombre, i.productos?.marca, i.productos?.modelo].filter(Boolean).join(" ") || (i.descripcion ?? "").trim())
        .filter(Boolean),
    });
  }

  return {
    ok: true,
    cliente: {
      nombre: cli.nombre,
      empresas: cli.cuentas.map((c) => ({ id: c.id, razon_social: c.razon_social, num_doc: c.num_doc ?? "" })),
    },
    asesor: await asesorDe(admin, cli),
    cotizaciones,
    pedidos,
    casos: casosRespuesta,
    equipos,
    mensajes: mensajesCrudos,
  };
}

/** El comercial dueño de la ficha (la primera que tenga uno activo y real). */
async function asesorDe(admin: Admin, cli: ClienteIdentificado): Promise<RespuestaPortal["asesor"]> {
  const ids = [...new Set(cli.cuentas.map((c) => c.comercial_id).filter((x): x is string => Boolean(x)))];
  if (ids.length === 0) return null;
  const { data } = await admin.from("perfiles").select("id, nombre, celular, email_contacto, activo, es_prueba").in("id", ids);
  const perfiles = (data ?? []) as { id: string; nombre: string; celular: string | null; email_contacto: string | null; activo: boolean; es_prueba: boolean | null }[];
  for (const id of cli.cuentas.map((c) => c.comercial_id)) {
    const p = perfiles.find((x) => x.id === id && x.activo && (!x.es_prueba || cli.incluyePrueba));
    if (p) return { nombre: p.nombre, celular: p.celular ?? "", correo: p.email_contacto ?? "" };
  }
  return null;
}

async function leerMensajes(admin: Admin, idsCuenta: string[], pedidosComoReceptor: string[]): Promise<MensajePortal[]> {
  const sel = "id, autor, autor_nombre, texto, created_at, servicio_id, atencion_id";
  const [deFicha, dePedido] = await Promise.all([
    enTrozos<Parameters<typeof mensajeParaPortal>[0]>(idsCuenta, (parte) =>
      admin.from("portal_mensajes").select(sel).in("cuenta_id", parte).order("created_at", { ascending: false }).limit(300),
    ),
    enTrozos<Parameters<typeof mensajeParaPortal>[0]>(pedidosComoReceptor, (parte) =>
      admin.from("portal_mensajes").select(sel).in("servicio_id", parte).order("created_at", { ascending: false }).limit(100),
    ),
  ]);
  const vistos = new Set<string>();
  return [...deFicha, ...dePedido]
    .filter((m) => (vistos.has(m.id) ? false : (vistos.add(m.id), true)))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    .map(mensajeParaPortal);
}
