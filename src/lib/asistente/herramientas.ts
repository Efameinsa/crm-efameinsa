import { createClient } from "@/lib/supabase/server";
import { buscarEnTodo } from "@/lib/buscar-en-todo";
import { cargarCierreSemanal } from "@/lib/cierre-semanal";
import { cargarHistorialSemanas } from "@/lib/historial-semanas";
import { cargarResumenGerencia } from "@/lib/reportes";
import { lunesSemana } from "@/lib/potenciales-semana";
import { periodoPreset } from "@/lib/periodo";
import { cargarCatalogo } from "@/lib/catalogo-operaciones";
import { buscarEquipos } from "@/lib/buscar-equipo";

/**
 * LO QUE EL ASISTENTE PUEDE PREGUNTARLE AL CRM. Y nada más.
 *
 * POR QUÉ HERRAMIENTAS CERRADAS Y NO CONSULTAS LIBRES. La alternativa sería
 * darle el esquema y dejar que escriba sus propias consultas. Se descartó por
 * una razón medida, no por prudencia genérica: el esquema tiene trampas que
 * hacen equivocar a cualquiera que lo lea por primera vez —y esta semana me
 * hicieron equivocar a mí tres veces—:
 *
 *   · `monto_total` significa cosas distintas en dos tablas: en `ventas` es
 *     SIN IGV y en `informes_cierre` es CON IGV. Un 18 % de diferencia.
 *   · `anulado_at` y `anulada_at` se llaman casi igual y viven en tablas
 *     distintas. Olvidar uno hace que lo anulado siga contando (pasó el 05-09).
 *   · Hay dos tablas de cotizaciones, con nombres de columna distintos para lo
 *     mismo, y dos series de correlativos por empresa: «la 431» puede ser dos
 *     documentos.
 *   · `origen = 'crm'` deja fuera todo lo que vino del Excel, que es la
 *     mayoría.
 *   · Doce tablas tienen datos de práctica mezclados con los reales.
 *
 * Cada herramienta de acá abajo llama a la MISMA función que alimenta las
 * pantallas del CRM. Eso garantiza lo único que no se puede negociar: que el
 * asistente y el sistema digan el mismo número. Si el cierre semanal dice
 * 7.684, el asistente dice 7.684.
 *
 * PERMISOS. Todas usan `createClient()`, que va con la sesión de quien
 * pregunta. Las políticas de la base filtran solas: gerencia ve todo, un
 * comercial vería solo lo suyo. No hay llave maestra en este camino.
 *
 * SOLO LECTURA. Ninguna herramienta escribe. El asistente responde preguntas;
 * no registra, no anula, no deriva.
 */

/** Lo que se le muestra al usuario como respaldo de la respuesta. */
export interface Evidencia {
  herramienta: string;
  argumentos: Record<string, unknown>;
  resumen: string;
  datos: unknown;
}

type Ejecutor = (args: Record<string, unknown>) => Promise<{ resumen: string; datos: unknown }>;

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Encuentra a un comercial por su código (C1) o por parte de su nombre. */
async function buscarComercial(quien: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("perfiles")
    .select("id, nombre, codigo_comercial")
    .or(`codigo_comercial.ilike.${quien},nombre.ilike.%${quien}%`)
    .limit(1)
    .maybeSingle();
  return data;
}

interface Declaracion {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const HERRAMIENTAS: { declaracion: Declaracion; ejecutar: Ejecutor }[] = [
  // ── 1. Buscar cualquier cosa ────────────────────────────────────────────
  {
    declaracion: {
      type: "function" as const,
      name: "buscar_en_todo",
      description:
        "Busca en todo el CRM por un número de documento o un nombre: cotizaciones del CRM y del archivo, cierres de venta, clientes por RUC o razón social, contactos de Central, equipos instalados por su serie y pedidos de postventa. Devuelve qué es cada cosa, de qué comercial es y en qué estado está. Úsala siempre que la pregunta mencione un número de presupuesto (Presu_562-26 o solo 562), un cierre (014-2026), un contacto (PRO-09158), un RUC, un nombre de cliente o una serie de máquina.",
      parameters: {
        type: "object",
        properties: {
          texto: { type: "string", description: "El número, RUC, nombre o serie tal como lo dijo la persona." },
        },
        required: ["texto"],
      },
    },
    ejecutar: async (args) => {
      const h = await buscarEnTodo(texto(args.texto));
      return {
        resumen: `${h.total} resultado(s) para «${h.consulta}»`,
        datos: h.grupos.map((g) => ({ tipo: g.etiqueta, resultados: g.items })),
      };
    },
  },

  // ── 2. Cómo le fue a un comercial ───────────────────────────────────────
  {
    declaracion: {
      type: "function" as const,
      name: "resumen_de_comercial",
      description:
        "Cifras de un comercial en un período: cuánto vendió en dólares, cuántas ventas cerró, cuántos clientes compraron, cuántas cotizaciones envió y cuánto cotizó, más su tasa de cierre y su meta. Úsala para preguntas de «cuánto vendió», «cuánto cotizó», «cómo va» de una persona.",
      parameters: {
        type: "object",
        properties: {
          comercial: { type: "string", description: "Código (C1, C5) o parte del nombre (Brenda, Katerine)." },
          periodo: {
            type: "string",
            description: "semana, semana_anterior, mes, mes_anterior, 90d o anio. Por defecto: mes.",
          },
        },
        required: ["comercial"],
      },
    },
    ejecutar: async (args) => {
      const p = await buscarComercial(texto(args.comercial));
      if (!p) return { resumen: "No se encontró ese comercial", datos: null };
      const preset = (texto(args.periodo) || "mes") as Parameters<typeof periodoPreset>[0];
      const periodo = periodoPreset(preset);
      const supabase = await createClient();
      const r = await cargarResumenGerencia(supabase, { ...periodo, comercialId: p.id });
      const k = r?.kpis;
      const yo = r?.por_comercial?.[0];
      return {
        resumen: `${p.codigo_comercial} · ${p.nombre} · ${periodo.desde} a ${periodo.hasta}`,
        datos: {
          comercial: `${p.codigo_comercial} · ${p.nombre}`,
          periodo: `${periodo.desde} a ${periodo.hasta}`,
          vendido_usd: k ? Math.round(k.ventas_usd_equiv) : null,
          ventas_cerradas: k?.n_ventas ?? null,
          clientes_que_compraron: k?.clientes_con_venta ?? null,
          ticket_promedio_usd: k ? Math.round(k.ticket_promedio_usd) : null,
          meta_del_periodo_usd: yo?.meta_periodo ? Math.round(yo.meta_periodo) : null,
          oportunidades_ganadas: k?.op_ganadas ?? null,
          oportunidades_rechazadas: k?.op_rechazadas ?? null,
        },
      };
    },
  },

  // ── 3. El cierre de una semana ──────────────────────────────────────────
  {
    declaracion: {
      type: "function" as const,
      name: "cierre_de_la_semana",
      description:
        "El cierre semanal de un comercial: lo proyectado contra lo vendido, día por día, las ventas cerradas, lo que quedó pendiente, las oportunidades perdidas con su motivo, y lo que el comercial declaró que va a hacer y qué necesita. Úsala para preguntas sobre la semana, sobre por qué alguien no llegó a su meta, o sobre qué se perdió y por qué.",
      parameters: {
        type: "object",
        properties: {
          comercial: { type: "string", description: "Código (C1, C5) o parte del nombre." },
          lunes: { type: "string", description: "Lunes de la semana en formato 2026-08-31. Por defecto, la semana actual." },
        },
        required: ["comercial"],
      },
    },
    ejecutar: async (args) => {
      const p = await buscarComercial(texto(args.comercial));
      if (!p) return { resumen: "No se encontró ese comercial", datos: null };
      const lunes = lunesSemana(texto(args.lunes) || undefined);
      const c = await cargarCierreSemanal(lunes, p.id);
      return {
        resumen: `${p.codigo_comercial} · semana del ${c.lunes} al ${c.sabado}`,
        datos: {
          comercial: `${p.codigo_comercial} · ${p.nombre}`,
          semana: `${c.lunes} al ${c.sabado}`,
          proyectado_usd: Math.round(c.proyectadoUsd),
          vendido_usd: Math.round(c.vendidoUsd),
          gestiones: c.medidas.gestiones,
          cotizaciones: c.medidas.cotizaciones,
          venta_contra_meta: c.medidas.venta,
          veredicto: c.veredicto,
          ventas: c.ventas.map((v) => ({ fecha: v.fecha, cliente: v.cliente, usd: Math.round(v.montoUsd) })),
          perdidas: c.rechazos.map((r) => ({ cliente: r.cliente, motivo: r.motivo, usd: Math.round(r.monto) })),
          declaracion: c.declaracion,
          // El aviso que evita la lectura engañosa: proyectar poco hace que
          // «vendió más de lo proyectado» no signifique nada.
          aviso:
            c.medidas.venta.meta != null && c.proyectadoUsd < c.medidas.venta.meta * 0.33
              ? `Solo se proyectaron US$ ${Math.round(c.proyectadoUsd)} contra una meta semanal de US$ ${Math.round(c.medidas.venta.meta)}. El contraste proyectado/vendido dice poco mientras las oportunidades en negociación no tengan fecha de cierre.`
              : null,
        },
      };
    },
  },

  // ── 4. El historial de semanas ──────────────────────────────────────────
  {
    declaracion: {
      type: "function" as const,
      name: "historial_de_semanas",
      description:
        "Las últimas doce semanas de un comercial: lo vendido, las gestiones, las cotizaciones y lo que declaró cada sábado (a qué se comprometió y qué pidió). Úsala para ver la evolución, para comparar semanas, o para saber qué pidió alguien y si cumplió lo que dijo.",
      parameters: {
        type: "object",
        properties: { comercial: { type: "string", description: "Código (C1, C5) o parte del nombre." } },
        required: ["comercial"],
      },
    },
    ejecutar: async (args) => {
      const p = await buscarComercial(texto(args.comercial));
      if (!p) return { resumen: "No se encontró ese comercial", datos: null };
      const semanas = await cargarHistorialSemanas(p.id);
      return {
        resumen: `${p.codigo_comercial} · últimas ${semanas.length} semanas`,
        datos: semanas.map((s) => ({
          semana: `${s.lunes} al ${s.sabado}`,
          vendido_usd: Math.round(s.vendidoUsd),
          ventas: s.ventas,
          gestiones: s.gestiones,
          cotizaciones: s.cotizaciones,
          estado: s.estado,
          se_comprometio_a: s.compromiso,
          necesita: s.sinNecesidades ? "nada" : s.necesidades,
          cerro_la_semana: s.declaradoAt != null,
        })),
      };
    },
  },

  // ── 5. El equipo del área comercial, de un vistazo ──────────────────────
  {
    declaracion: {
      type: "function" as const,
      name: "comparar_comerciales",
      description:
        "Compara a todos los comerciales en un período: cuánto vendió cada uno, cuántas ventas y cuánto cotizó. Úsala para preguntas de ranking, de «quién va mejor» o «cómo va el equipo».",
      parameters: {
        type: "object",
        properties: {
          periodo: { type: "string", description: "semana, semana_anterior, mes, mes_anterior, 90d o anio. Por defecto: mes." },
        },
        required: [],
      },
    },
    ejecutar: async (args) => {
      const preset = (texto(args.periodo) || "mes") as Parameters<typeof periodoPreset>[0];
      const periodo = periodoPreset(preset);
      const supabase = await createClient();
      const r = await cargarResumenGerencia(supabase, periodo);
      return {
        resumen: `Equipo comercial · ${periodo.desde} a ${periodo.hasta}`,
        datos: (r?.por_comercial ?? []).map((c) => ({
          comercial: `${c.codigo ?? "—"} · ${c.nombre}`,
          vendido_usd: Math.round(c.ventas_usd ?? 0),
          ventas: c.n_ventas ?? 0,
          meta_del_periodo_usd: c.meta_periodo ? Math.round(c.meta_periodo) : null,
        })),
      };
    },
  },

  // ── 6. Qué equipos hay y a cuánto ───────────────────────────────────────
  {
    declaracion: {
      type: "function" as const,
      name: "productos_disponibles",
      description:
        "Busca equipos en el catálogo y devuelve marca, modelo, capacidad, sus precios vigentes por nivel y cuántos hay. Úsala para «¿tenemos lavadoras de 30 kg?», «¿a cuánto sale la RX135?», «¿qué secadoras a gas manejamos?», «¿hay stock de…?». Acepta la frase completa tal como la dijo la persona.",
      parameters: {
        type: "object",
        properties: {
          texto: { type: "string", description: "Lo que busca: «lavadora 30 kg», «RX135», «secadora a gas primus». Vacío devuelve todo el catálogo activo." },
          incluir_inactivos: { type: "boolean", description: "Por defecto false: solo los equipos que se pueden cotizar hoy." },
        },
        required: [],
      },
    },
    ejecutar: async (args) => {
      const supabase = await createClient();
      const { equipos } = await cargarCatalogo(supabase);
      const incluirInactivos = args.incluir_inactivos === true;
      const base = incluirInactivos ? equipos : equipos.filter((e) => e.activo);
      const consulta = texto(args.texto);
      const hallados = consulta ? buscarEquipos(base, consulta) : base;
      const TOPE = 15;
      return {
        resumen: consulta
          ? `${hallados.length} equipo(s) para «${consulta}»`
          : `${hallados.length} equipo(s) en el catálogo`,
        datos: {
          total: hallados.length,
          mostrados: Math.min(hallados.length, TOPE),
          equipos: hallados.slice(0, TOPE).map((e) => ({
            sku: e.sku,
            equipo: `${e.marca} ${e.modelo}`,
            nombre: e.nombre,
            capacidad: e.capacidad,
            segmento: e.segmento === "semi_industrial" ? "semi-industrial" : "industrial",
            calentamiento: e.calentamiento,
            precios_usd: e.precios.map((x) => ({ nivel: x.tier, precio: Math.round(x.precio) })),
            en_almacen: e.disponibles,
            stock_del_maestro: e.stockReferencia,
            activo: e.activo,
          })),
          // Dos números de stock que NO significan lo mismo, y confundirlos
          // hace prometerle a un cliente una máquina que no está.
          aviso:
            "Hay dos cifras de stock y son distintas: «en_almacen» es el conteo del almacén del CRM (null = ese modelo todavía no se cargó al almacén) y «stock_del_maestro» es la foto del maestro de Lesly del día en que se cargó el catálogo, no un conteo de hoy. Al responder por disponibilidad, decí de cuál de las dos estás hablando y que conviene confirmarla con Operaciones.",
        },
      };
    },
  },
];

export const DECLARACIONES = HERRAMIENTAS.map((h) => h.declaracion);

export async function ejecutarHerramienta(
  nombre: string,
  argumentos: Record<string, unknown>,
): Promise<Evidencia> {
  const h = HERRAMIENTAS.find((x) => x.declaracion.name === nombre);
  if (!h) {
    return { herramienta: nombre, argumentos, resumen: "Esa consulta no existe", datos: null };
  }
  const r = await h.ejecutar(argumentos);
  return { herramienta: nombre, argumentos, resumen: r.resumen, datos: r.datos };
}
