import { createClient } from "@/lib/supabase/server";

/**
 * EL BUSCADOR UNIVERSAL — una caja para «¿dónde está esto?».
 *
 * POR QUÉ EXISTE. Es el requerimiento más viejo sin levantar: gerencia lo pidió
 * en la demo del 14-08 —«busca cualquier cliente y ve a quién pertenece y toda
 * su data»— y nunca se construyó. Tres semanas después sigue siendo la pregunta
 * que más se repite en las reuniones: de las 260 preguntas que hizo el ing.
 * Carlos en las grabaciones, 57 empiezan con «¿dónde…?».
 *
 * Y es la que más veces terminó en el chat en vez de en el CRM. El 04-09, en
 * plena reunión: «la 431, ¿está en el CRM?», «¿dónde lo puedo encontrar?»,
 * «¿quién lo gestiona?», «no encuentro la 431 en la cartera de Brenda». Cuatro
 * preguntas seguidas que son la misma: alguien dice un número y hay que saber
 * qué es, de quién es y en qué estado está.
 *
 * QUÉ ACEPTA. Lo que la gente dice en voz alta, sin explicarle al sistema qué
 * está buscando:
 *
 *   Presu_562-26  ·  562        una cotización del CRM
 *   130-26                      una del archivo histórico
 *   014-2026      ·  014        un informe de cierre
 *   PRO-09158                   un contacto de Central
 *   20100160375                 un RUC o DNI
 *   SIERRA TRAVEL               parte de una razón social
 *   309KWGG53903                la serie de una máquina instalada
 *   420-26                      un número de pedido del ERP
 *
 * No se le pregunta al usuario de qué tipo es: se busca en los siete lados a la
 * vez y se devuelve lo que aparezca. Escribir «562» trae la cotización 562 y
 * también el pedido 562 si existe, y está bien que así sea — quien pregunta no
 * siempre sabe qué tiene en la mano.
 *
 * PERMISOS. Las consultas van con la sesión de quien busca, así que las
 * políticas de la base filtran solas: gerencia ve todo, un comercial ve lo
 * suyo. No hace falta —ni conviene— una función con privilegios.
 */

export type TipoResultado =
  | "cliente"
  | "cotizacion"
  | "cotizacion_historica"
  | "cierre"
  | "contacto"
  | "equipo"
  | "pedido";

export interface Resultado {
  tipo: TipoResultado;
  /** Lo que se escribiría en voz alta: «Presu_562-26», «014-2026». */
  titulo: string;
  /** De quién es: el cliente, o el nombre del contacto. */
  cliente: string | null;
  /** Quién lo gestiona. Es la mitad de la pregunta que se hace en la reunión. */
  responsable: string | null;
  /** En qué estado está, en palabras. */
  estado: string | null;
  /** Fecha relevante, ya en texto. */
  fecha: string | null;
  /** Importe, si lo tiene. */
  monto: string | null;
  /** A dónde lleva el clic. */
  href: string | null;
  /** Un segundo enlace, cuando el documento tiene PDF propio. */
  hrefPdf?: string | null;
}

export interface Hallazgos {
  consulta: string;
  total: number;
  grupos: { tipo: TipoResultado; etiqueta: string; items: Resultado[] }[];
}

const ETIQUETA: Record<TipoResultado, string> = {
  cliente: "Clientes",
  cotizacion: "Cotizaciones del CRM",
  cotizacion_historica: "Cotizaciones del archivo",
  cierre: "Cierres de venta",
  contacto: "Contactos de Central",
  equipo: "Equipos instalados",
  pedido: "Pedidos de postventa",
};

const POR_TIPO = 8;

const dinero = (monto: unknown, moneda: unknown): string | null =>
  monto == null ? null : `${moneda === "PEN" ? "S/" : "US$"} ${Math.round(Number(monto)).toLocaleString("es-PE")}`;

const dia = (f: unknown): string | null => (f ? String(f).slice(0, 10).split("-").reverse().join("/") : null);

/**
 * Busca en los siete lados a la vez.
 *
 * El patrón es siempre `%loQueEscribió%` para que «562» encuentre
 * «Presu_562-26» sin que nadie tenga que escribir el prefijo. Cada consulta
 * trae pocas filas: esto es un buscador de reunión, no un listado.
 */
export async function buscarEnTodo(
  consulta: string,
  /** Cliente ya construido, para poder probarlo desde un script sin sesión. */
  cliente?: Awaited<ReturnType<typeof createClient>>,
): Promise<Hallazgos> {
  const q = consulta.trim();
  if (q.length < 2) return { consulta: q, total: 0, grupos: [] };

  const supabase = cliente ?? (await createClient());
  const patron = `%${q}%`;

  /**
   * UN NÚMERO CORTO ES UN DOCUMENTO, NO UN CLIENTE.
   *
   * Cuando alguien dice «la 431» está hablando de un presupuesto o de un
   * cierre — nunca de un RUC. Buscar «431» dentro de todos los documentos de
   * identidad devolvía ocho clientes cuyo RUC contiene ese número y ocho
   * contactos con códigos como PRO-00431, y enterraba justo lo que se estaba
   * buscando. Con cuatro dígitos o menos se busca solo en los números de
   * documento; a partir de cinco caracteres se abre a clientes y contactos.
   */
  const soloNumero = /^\d{1,4}$/.test(q);
  // Un documento de identidad se escribe entero o desde el principio, nunca
  // por el medio.
  const patronDoc = `${q}%`;

  const vacio = Promise.resolve({ data: [] as never[] });

  const [cuentas, cots, cotsHist, cierres, contactos, equipos, pedidos] = await Promise.all([
    soloNumero
      ? vacio
      : supabase
          .from("cuentas")
          .select("id, razon_social, nombre_comercial, num_doc, tipo_doc, ultima_venta_at, perfiles(nombre, codigo_comercial)")
          .or(`razon_social.ilike.${patron},nombre_comercial.ilike.${patron},num_doc.ilike.${patronDoc}`)
          .limit(POR_TIPO),
    // El vínculo se nombra: PostgREST encuentra más de un camino entre
    // cotizaciones y oportunidades y, si no se elige, devuelve un error que la
    // pantalla leería como «no hay nada». Pasó en la primera prueba.
    supabase
      .from("cotizaciones")
      .select(
        "id, codigo, total, moneda, estado, enviada_at, created_at, oportunidades!cotizaciones_oportunidad_id_fkey(cuentas(razon_social), perfiles(nombre, codigo_comercial))",
      )
      .ilike("codigo", patron)
      .limit(POR_TIPO),
    // El archivo histórico usa otros nombres: `cliente` y `monto_sin_igv`, sin
    // moneda (todo el archivo está en dólares).
    supabase
      .from("cotizaciones_historicas")
      .select(
        "id, codigo, monto_sin_igv, fecha, cliente, cuentas(razon_social), perfiles!cotizaciones_historicas_comercial_id_fkey(nombre, codigo_comercial)",
      )
      .ilike("codigo", patron)
      .limit(POR_TIPO),
    supabase
      .from("informes_cierre")
      .select(
        "id, codigo, serie, monto_total, moneda, fecha, emitido_at, anulado_at, cliente_nombre, cuentas(razon_social), perfiles!informes_cierre_creado_por_fkey(nombre, codigo_comercial)",
      )
      .ilike("codigo", patron)
      .limit(POR_TIPO),
    soloNumero
      ? vacio
      : supabase
          .from("leads")
          .select(
            "id, codigo, razon_social, nombre_contacto, estado, canal, created_at, cuenta_id, perfiles!leads_asignado_a_fkey(nombre, codigo_comercial)",
          )
          .or(`codigo.ilike.${patron},razon_social.ilike.${patron},nombre_contacto.ilike.${patron},num_doc.ilike.${patronDoc}`)
          .limit(POR_TIPO),
    supabase
      .from("equipos_instalados")
      .select("id, serie, modelo_texto, cliente_texto, garantia_hasta, proximo_mantenimiento, cuentas(razon_social)")
      .or(soloNumero ? `serie.ilike.${patron}` : `serie.ilike.${patron},modelo_texto.ilike.${patron}`)
      .limit(POR_TIPO),
    supabase
      .from("servicios_postventa")
      .select("id, numero_pedido_erp, tipo_servicio, equipo, cliente_texto, cerrado_at, completado, cuentas(razon_social)")
      .ilike("numero_pedido_erp", patron)
      .limit(POR_TIPO),
  ]);

  const dueño = (p: unknown): string | null => {
    const x = p as { nombre?: string; codigo_comercial?: string | null } | null;
    if (!x?.nombre) return null;
    return x.codigo_comercial ? `${x.codigo_comercial} · ${x.nombre}` : x.nombre;
  };
  const razon = (c: unknown): string | null => (c as { razon_social?: string } | null)?.razon_social ?? null;

  const grupos: Hallazgos["grupos"] = [];
  const agregar = (tipo: TipoResultado, items: Resultado[]) => {
    if (items.length > 0) grupos.push({ tipo, etiqueta: ETIQUETA[tipo], items });
  };

  agregar(
    "cliente",
    (cuentas.data ?? []).map((c) => ({
      tipo: "cliente" as const,
      titulo: c.razon_social ?? c.nombre_comercial ?? "Cliente sin nombre",
      cliente: c.num_doc ? `${c.tipo_doc ?? "DOC"} ${c.num_doc}` : "sin documento",
      responsable: dueño(c.perfiles),
      estado: c.ultima_venta_at ? `última venta ${dia(c.ultima_venta_at)}` : "sin ventas registradas",
      fecha: null,
      monto: null,
      href: `/gerencia/clientes/${c.id}`,
    })),
  );

  agregar(
    "cotizacion",
    (cots.data ?? []).map((c) => {
      const op = c.oportunidades as unknown as { cuentas: { razon_social: string } | null; perfiles: unknown } | null;
      return {
        tipo: "cotizacion" as const,
        titulo: c.codigo ?? "sin número",
        cliente: razon(op?.cuentas),
        responsable: dueño(op?.perfiles),
        // «enviada · enviada» no le dice nada a nadie: si el estado ya es
        // «enviada», con eso basta.
        estado: c.enviada_at
          ? c.estado === "enviada"
            ? "enviada"
            : `enviada · ${c.estado}`
          : `${c.estado} (sin enviar)`,
        fecha: dia(c.enviada_at ?? c.created_at),
        monto: dinero(c.total, c.moneda),
        href: null,
        hrefPdf: `/api/cotizaciones/${c.id}/pdf`,
      };
    }),
  );

  agregar(
    "cotizacion_historica",
    (cotsHist.data ?? []).map((c) => ({
      tipo: "cotizacion_historica" as const,
      titulo: c.codigo ?? "sin número",
      cliente: razon(c.cuentas) ?? c.cliente,
      responsable: dueño(c.perfiles),
      estado: "del archivo de documentos",
      fecha: dia(c.fecha),
      // El archivo guarda el monto sin IGV y todo en dólares.
      monto: dinero(c.monto_sin_igv, "USD"),
      href: null,
      hrefPdf: `/api/cotizaciones-historicas/${c.id}/pdf`,
    })),
  );

  agregar(
    "cierre",
    (cierres.data ?? []).map((i) => ({
      tipo: "cierre" as const,
      titulo: `${i.codigo ?? "sin número"} · ${i.serie ?? ""}`.trim(),
      cliente: razon(i.cuentas) ?? i.cliente_nombre,
      responsable: dueño(i.perfiles),
      estado: i.anulado_at ? "ANULADO" : i.emitido_at ? "emitido" : "borrador",
      fecha: dia(i.fecha),
      monto: dinero(i.monto_total, i.moneda),
      href: null,
      hrefPdf: `/api/informes/${i.id}/pdf`,
    })),
  );

  agregar(
    "contacto",
    (contactos.data ?? []).map((l) => ({
      tipo: "contacto" as const,
      titulo: l.codigo ?? "sin código",
      cliente: l.razon_social ?? l.nombre_contacto,
      responsable: dueño(l.perfiles),
      estado: `${String(l.estado).replace(/_/g, " ")} · por ${l.canal}`,
      fecha: dia(l.created_at),
      monto: null,
      href: l.cuenta_id ? `/gerencia/clientes/${l.cuenta_id}` : null,
    })),
  );

  agregar(
    "equipo",
    (equipos.data ?? []).map((e) => ({
      tipo: "equipo" as const,
      titulo: e.serie ?? "sin serie",
      cliente: razon(e.cuentas) ?? e.cliente_texto,
      responsable: null,
      estado: e.modelo_texto ? String(e.modelo_texto).slice(0, 70) : null,
      fecha: e.garantia_hasta ? `garantía hasta ${dia(e.garantia_hasta)}` : null,
      monto: null,
      href: `/postventa/equipos/${e.id}`,
    })),
  );

  agregar(
    "pedido",
    (pedidos.data ?? []).map((s) => ({
      tipo: "pedido" as const,
      titulo: `Pedido ${s.numero_pedido_erp}`,
      cliente: razon(s.cuentas) ?? s.cliente_texto,
      responsable: null,
      estado: s.cerrado_at || s.completado ? "cerrado" : "en curso",
      fecha: null,
      monto: null,
      href: `/postventa/pedidos/${s.id}`,
    })),
  );

  return { consulta: q, total: grupos.reduce((n, g) => n + g.items.length, 0), grupos };
}
