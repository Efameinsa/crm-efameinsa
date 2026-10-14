import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { buscarEnTodo } from "@/lib/buscar-en-todo";
import { cargarCierreSemanal } from "@/lib/cierre-semanal";
import { cargarHistorialSemanas } from "@/lib/historial-semanas";
import { cargarResumenGerencia } from "@/lib/reportes";
import { lunesSemana } from "@/lib/potenciales-semana";
import { periodoPreset } from "@/lib/periodo";
import { cargarCatalogo } from "@/lib/catalogo-operaciones";
import { buscarEquipos } from "@/lib/buscar-equipo";
import { cargarHistorialCuenta } from "@/lib/historial-cuenta";
import {
  bloquesPedido,
  circuitoDe,
  estadoPago,
  ETIQUETA_ESTADO_PAGO,
  etiquetaResponsable,
  queLoFrena,
  evaluarPagoParaDespacho,
  faltaVistoBuenoFinanzas,
  faltanLetrasEnAlmacen,
  pideVistoBuenoFinanzas,
  type ServicioPostventa,
} from "@/lib/postventa";
import { nombresDelPedido } from "@/lib/nombres-del-pedido";
import { enlaceDelCliente, enlacesDeCotizacion, enlacesDelPedido } from "@/lib/asistente/enlaces";
import { esComercialDeVenta, esGerencia, taparMontos, verMontos, verPreciosCatalogo, type Quien } from "@/lib/asistente/permisos";

/**
 * LO QUE EL ASISTENTE PUEDE PREGUNTARLE AL CRM. Y nada más.
 *
 * POR QUÉ HERRAMIENTAS CERRADAS Y NO CONSULTAS LIBRES. La alternativa sería
 * darle el esquema y dejar que escriba sus propias consultas. Se descartó por
 * una razón medida: el esquema tiene trampas que hacen equivocar a cualquiera
 * que lo lea por primera vez —`monto_total` es sin IGV en `ventas` y con IGV en
 * `informes_cierre`; `anulado_at` y `anulada_at` viven en tablas distintas; dos
 * series de correlativos hacen que «la 431» pueda ser dos documentos—. Cada
 * herramienta llama a la MISMA función que alimenta las pantallas, así el
 * asistente y el sistema dicen el mismo número.
 *
 * PERMISOS (14-10, el asistente pasa a ser de todo el personal). Tres capas:
 *   1. Cada herramienta declara para quién existe. A un comercial no se le
 *      ofrece «comparar comerciales»: el modelo ni sabe que existe.
 *   2. Las consultas van con la sesión de quien pregunta (`createClient()`):
 *      las políticas de la base filtran las filas como en sus pantallas.
 *   3. Si quien pregunta no ve montos (postventa, almacén, importaciones), las
 *      cifras se tapan ANTES de dárselas al modelo (`taparMontos`).
 *
 * SOLO LECTURA. Ninguna herramienta escribe. `npm run db:auditar-asistente` lo
 * comprueba antes de cada despliegue.
 */

/** Lo que se le muestra al usuario como respaldo de la respuesta. */
export interface Evidencia {
  herramienta: string;
  argumentos: Record<string, unknown>;
  resumen: string;
  datos: unknown;
}

type Ejecutor = (args: Record<string, unknown>, quien: Quien) => Promise<{ resumen: string; datos: unknown }>;

interface Herramienta {
  definicion: Anthropic.Tool;
  /** Para quién existe. Si no es para esta persona, el modelo no la ve. */
  para: (q: Quien) => boolean;
  ejecutar: Ejecutor;
  /** Lo que ve la persona mientras se consulta: «Buscando «562»…». */
  aviso: (args: Record<string, unknown>) => string;
  /** Quién ve las cifras de ESTA consulta, si no es la regla general (verMontos). */
  verCifras?: (q: Quien) => boolean;
}

const texto = (v: unknown): string => (typeof v === "string" ? v.trim().slice(0, 200) : "");
const todos = () => true;

/** Encuentra a un comercial por su código (C1) o por parte de su nombre. */
async function buscarComercial(quien: string) {
  const supabase = await createClient();
  const limpio = quien.replace(/[%,()]/g, "");
  // Solo cuentas activas y reales, y primero la que tiene código de cartera:
  // el 14-10, buscando «Katerine», salió una cuenta de práctica sin código con
  // todo en cero y el asistente contestó «no vendió nada».
  const { data } = await supabase
    .from("perfiles")
    .select("id, nombre, codigo_comercial")
    .or(`codigo_comercial.ilike.${limpio},nombre.ilike.%${limpio}%`)
    .eq("activo", true)
    .eq("es_prueba", false)
    .order("codigo_comercial", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Fecha corta en hora de Lima, para que el modelo no tenga que convertir. */
function fechaLima(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(iso.length > 10 ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/** Quita de un patrón de búsqueda lo que rompe el filtro `or` de PostgREST. */
const patronSeguro = (s: string) => `%${s.replace(/[%,()*]/g, " ").trim()}%`;

const ETAPA_COTIZACION: Record<string, string> = {
  borrador: "en borrador (todavía no se envió al cliente)",
  enviada: "enviada al cliente",
  aceptada: "aceptada por el cliente",
  rechazada: "rechazada por el cliente",
  anulada: "anulada",
};
const APROBACION: Record<string, string> = {
  auto_aprobada: "no necesitó aprobación (precios dentro de lista)",
  pendiente_gerencia: "esperando la aprobación de gerencia (tiene precios bajo lista o líneas que gerencia debe ver)",
  aprobada_gerencia: "aprobada por gerencia",
  rechazada_gerencia: "gerencia la devolvió: hay renglones observados que corregir",
};

export const HERRAMIENTAS: Herramienta[] = [
  // ── 1. Buscar cualquier cosa ────────────────────────────────────────────
  {
    definicion: {
      name: "buscar_en_todo",
      description:
        "Busca en el CRM por un número de documento o un nombre: cotizaciones del CRM y del archivo, cierres de venta, clientes por RUC o razón social, contactos de Central, equipos instalados por su serie y pedidos. Devuelve qué es cada cosa, de quién es y en qué estado está, con los permisos de quien pregunta. Úsala cuando la pregunta mencione un número (Presu_562-26 o 562, cierre 014-2026, PRO-09158, pedido ERP 420-26), un RUC, un cliente o una serie.",
      input_schema: {
        type: "object",
        properties: {
          texto: { type: "string", description: "El número, RUC, nombre o serie tal como lo dijo la persona." },
        },
        required: ["texto"],
      },
    },
    para: todos,
    aviso: (a) => `Buscando «${texto(a.texto)}» en el CRM`,
    ejecutar: async (args) => {
      const h = await buscarEnTodo(texto(args.texto));
      return {
        resumen: `${h.total} resultado(s) para «${h.consulta}»`,
        datos: {
          encontrados: h.total,
          grupos: h.grupos.map((g) => ({
            tipo: g.etiqueta,
            // El enlace del buscador apunta a pantallas de gerencia: a otra
            // persona la llevaría a una que no puede abrir.
            resultados: g.items.map(({ href: _h, hrefPdf: _p, ...r }) => r),
          })),
          nota:
            h.total === 0
              ? "No apareció nada con los permisos de quien pregunta. Puede no existir, estar escrito distinto, o ser de una cartera que no le corresponde ver."
              : undefined,
        },
      };
    },
  },

  // ── 2. La historia de un cliente ────────────────────────────────────────
  {
    definicion: {
      name: "historial_del_cliente",
      description:
        "La historia de un cliente tal como la ve quien pregunta en la ficha: de qué comercial es, gestiones recientes, cotizaciones (del CRM y del archivo, con los equipos cotizados), ventas y trabajos de postventa. Si quien pregunta es de postventa o almacén, viene sin montos pero con las descripciones. Úsala para «¿qué le vendimos a X?», «¿qué se le cotizó?», «¿quién lo atiende?», «¿cuándo fue la última gestión?».",
      input_schema: {
        type: "object",
        properties: {
          cliente: { type: "string", description: "Razón social (o parte), nombre comercial, o RUC/DNI." },
        },
        required: ["cliente"],
      },
    },
    para: todos,
    aviso: (a) => `Abriendo la historia de «${texto(a.cliente)}»`,
    ejecutar: async (args, quien) => {
      const supabase = await createClient();
      const q = texto(args.cliente);
      const esDoc = /^\d{8,11}$/.test(q);
      const { data: cuentas } = await supabase
        .from("cuentas")
        .select("id, razon_social, nombre_comercial, num_doc, tipo_doc, ultima_venta_at, perfiles(nombre, codigo_comercial)")
        .or(
          esDoc
            ? `num_doc.eq.${q}`
            : `razon_social.ilike.${patronSeguro(q)},nombre_comercial.ilike.${patronSeguro(q)}`,
        )
        .limit(6);
      const lista = (cuentas ?? []) as unknown as {
        id: string;
        razon_social: string | null;
        nombre_comercial: string | null;
        num_doc: string | null;
        tipo_doc: string | null;
        ultima_venta_at: string | null;
        perfiles: { nombre: string; codigo_comercial: string | null } | null;
      }[];
      const ficha = (c: (typeof lista)[number]) => ({
        cliente: c.razon_social ?? c.nombre_comercial,
        documento: c.num_doc ? `${c.tipo_doc ?? "DOC"} ${c.num_doc}` : null,
        cartera_de: c.perfiles ? `${c.perfiles.codigo_comercial ?? ""} ${c.perfiles.nombre}`.trim() : "sin comercial asignado",
        ultima_venta: fechaLima(c.ultima_venta_at),
        enlace: enlaceDelCliente(quien, c.id),
      });
      if (lista.length === 0) {
        return {
          resumen: `Ningún cliente visible para «${q}»`,
          datos: {
            nota: "No hay un cliente con ese nombre o documento que quien pregunta pueda ver. Si es de otra cartera, se pide desde la ficha con el código correspondiente.",
          },
        };
      }
      if (lista.length > 1) {
        return {
          resumen: `${lista.length} clientes posibles para «${q}»`,
          datos: { varios: lista.map(ficha), nota: "Hay varios. Pregúntele a la persona cuál es antes de seguir." },
        };
      }

      const c = lista[0];
      const sinCifras = !verMontos(quien);
      // Postventa mira la historia por la función de la base que trae todo
      // menos los montos (0221). Almacén e importaciones no tienen esa puerta:
      // ven lo que sus políticas abren, y las cifras se tapan abajo.
      const porLaPuertaDePostventa = sinCifras && Boolean(quien.es_postventa || quien.hace_postventa);
      const h = await cargarHistorialCuenta(supabase, c.id, { sinMontos: porLaPuertaDePostventa });

      // Las cotizaciones del archivo con sus equipos: es lo que postventa
      // necesita ver («que salga la descripción del producto… pero que no
      // salga el monto», Carlos 10-09).
      let archivo: { codigo: string | null; fecha: string | null; equipos: string[]; monto_sin_igv_usd: number | null }[] = [];
      if (porLaPuertaDePostventa) {
        const { data: paquete } = await supabase.rpc("historial_cuenta_para_postventa", { p_cuenta: c.id });
        const cot = ((paquete as { cot_historicas?: { codigo: string | null; fecha: string | null; items: string[] | null }[] } | null)
          ?.cot_historicas ?? []) as { codigo: string | null; fecha: string | null; items: string[] | null }[];
        archivo = cot.map((x) => ({ codigo: x.codigo, fecha: x.fecha, equipos: x.items ?? [], monto_sin_igv_usd: null }));
      } else {
        const { data: cot } = await supabase
          .from("cotizaciones_historicas")
          .select("codigo, fecha, items, monto_sin_igv")
          .eq("cuenta_id", c.id)
          .order("fecha", { ascending: false })
          .limit(15);
        archivo = ((cot ?? []) as { codigo: string | null; fecha: string | null; items: string[] | null; monto_sin_igv: number | null }[]).map(
          (x) => ({ codigo: x.codigo, fecha: x.fecha, equipos: x.items ?? [], monto_sin_igv_usd: x.monto_sin_igv }),
        );
      }

      const eventos = [...h.eventos]
        .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
        .slice(0, 25)
        .map((e) => {
          const x = e as unknown as Record<string, unknown>;
          return {
            tipo: x.tipo,
            fecha: fechaLima(x.fecha as string),
            expediente: x.expediente ?? null,
            ...(x.tipo === "actividad"
              ? {
                  gestion: x.tipoActividad,
                  resultado: (x.resultado as { nombre?: string } | null)?.nombre ?? null,
                  nota: x.nota,
                  quien: x.quien ?? null,
                  proxima_accion: x.proximaAccion ?? null,
                  proxima_accion_fecha: x.proximaAccionAt ?? null,
                }
              : {}),
            ...(x.tipo === "cotizacion" ? { codigo: x.codigo, estado: x.estadoLabel, monto: x.monto, moneda: x.moneda } : {}),
            ...(x.tipo === "venta"
              ? { monto: x.monto, moneda: x.moneda, anulada: x.anulada ?? false, presupuesto: x.presupuesto ?? null }
              : {}),
            ...(x.tipo === "servicio" ? { trabajo: x.titulo, detalle: x.detalle, quien: x.quien } : {}),
            ...(x.tipo === "solicitud" ? { pidio: x.mensaje, canal: x.canal, codigo: x.codigo, registro: x.quien } : {}),
          };
        });

      const ventas = h.ventasConDetalle.slice(0, 15).map((v) => ({
        fecha: v.fecha_venta,
        monto: v.monto_total,
        moneda: v.moneda,
        presupuesto: v.cotizaciones?.codigo ?? v.referencia_historica,
        equipos:
          v.cotizaciones?.cotizacion_items?.map((i) =>
            `${i.cantidad} × ${i.productos ? `${i.productos.marca} ${i.productos.modelo}` : "ítem"}`,
          ) ??
          v.documentoArchivo?.items ??
          (v.equipo_historico ? [v.equipo_historico] : []),
      }));

      const datos = {
        ...ficha(c),
        ventas,
        cotizaciones_del_archivo: archivo,
        ultimos_movimientos: eventos,
        expedientes_archivados: h.archivados.length,
      };
      return {
        resumen: `${c.razon_social ?? c.nombre_comercial} · ${eventos.length} movimiento(s)`,
        datos: sinCifras ? taparMontos(datos) : datos,
      };
    },
  },

  // ── 3. En qué está una cotización ───────────────────────────────────────
  {
    definicion: {
      name: "estado_de_cotizacion",
      description:
        "El estado de una cotización del CRM por su número (Presu_562-26 o 562): si está en borrador, enviada o aceptada, si espera aprobación de gerencia o la devolvió, qué renglones tiene y cuáles están bajo lista u observados, si se anuló y por qué, quién la hizo. Úsala para «¿por qué mi cotización no sale?», «¿ya la aprobó gerencia?», «¿qué le observaron?».",
      input_schema: {
        type: "object",
        properties: {
          numero: { type: "string", description: "El número tal como lo dijo: «Presu_562-26», «562-26» o «562»." },
        },
        required: ["numero"],
      },
    },
    para: todos,
    aviso: (a) => `Revisando la cotización ${texto(a.numero)}`,
    ejecutar: async (args, quien) => {
      const supabase = await createClient();
      const n = texto(args.numero).replace(/^presu[_\s-]*/i, "");
      const { data } = await supabase
        .from("cotizaciones")
        .select(
          "id, oportunidad_id, codigo, serie, estado, estado_aprobacion, total, moneda, created_at, enviada_at, aprobada_at, nota_gerencia, observacion_estado, revision_pedida_at, anulada_at, anulada_motivo, forma_pago, tiempo_entrega, version, creada:perfiles!cotizaciones_creada_por_fkey(nombre, codigo_comercial), aprobo:perfiles!cotizaciones_aprobada_por_fkey(nombre), oportunidades!cotizaciones_oportunidad_id_fkey(etapa, tipo_postventa, cuentas(razon_social)), cotizacion_items(cantidad, descripcion, nombre_impreso, precio_unitario, precio_lista, bajo_lista, requiere_aprobacion, aprobado, productos(marca, modelo, nombre))",
        )
        .ilike("codigo", `%${n.replace(/[%,()]/g, "")}%`)
        .order("created_at", { ascending: false })
        .limit(4);
      const filas = (data ?? []) as unknown as Record<string, unknown>[];
      if (filas.length === 0) {
        return {
          resumen: `Sin cotizaciones visibles con «${n}»`,
          datos: {
            nota: "No hay una cotización del CRM con ese número que quien pregunta pueda ver. Puede ser del archivo histórico (usar buscar_en_todo) o de una cartera ajena.",
          },
        };
      }
      const detalle = filas.map((c) => {
        const op = c.oportunidades as { etapa?: string; tipo_postventa?: string | null; cuentas?: { razon_social?: string } } | null;
        const items = (c.cotizacion_items as Record<string, unknown>[] | null) ?? [];
        const creada = c.creada as { nombre?: string; codigo_comercial?: string | null } | null;
        return {
          codigo: c.codigo,
          empresa: c.serie,
          cliente: op?.cuentas?.razon_social ?? null,
          de_postventa: Boolean(op?.tipo_postventa),
          hecha_por: creada ? `${creada.codigo_comercial ?? ""} ${creada.nombre ?? ""}`.trim() : null,
          creada: fechaLima(c.created_at as string),
          estado: ETAPA_COTIZACION[String(c.estado)] ?? c.estado,
          aprobacion: APROBACION[String(c.estado_aprobacion)] ?? c.estado_aprobacion,
          aprobo: (c.aprobo as { nombre?: string } | null)?.nombre ?? null,
          aprobada_el: fechaLima(c.aprobada_at as string | null),
          enviada_el: fechaLima(c.enviada_at as string | null),
          nota_de_gerencia: c.nota_gerencia,
          observacion: c.observacion_estado,
          revision_pedida_el: fechaLima(c.revision_pedida_at as string | null),
          anulada_el: fechaLima(c.anulada_at as string | null),
          motivo_anulacion: c.anulada_motivo,
          forma_pago: c.forma_pago,
          tiempo_entrega: c.tiempo_entrega,
          version: c.version,
          enlaces: enlacesDeCotizacion(quien, String(c.id), (c.oportunidad_id as string | null) ?? null),
          total: c.total,
          moneda: c.moneda,
          renglones: items.map((i) => {
            const p = i.productos as { marca?: string; modelo?: string; nombre?: string } | null;
            return {
              cantidad: i.cantidad,
              descripcion: i.nombre_impreso ?? (p ? `${p.marca ?? ""} ${p.modelo ?? ""}`.trim() : null) ?? i.descripcion,
              precio_unitario: i.precio_unitario,
              precio_lista: i.precio_lista,
              bajo_lista: i.bajo_lista,
              necesita_aprobacion: i.requiere_aprobacion,
              aprobado_por_gerencia: i.aprobado,
            };
          }),
        };
      });
      return {
        resumen: `${detalle.length} cotización(es) con «${n}»`,
        datos: verMontos(quien) ? detalle : taparMontos(detalle),
      };
    },
  },

  // ── 4. En qué está un pedido ────────────────────────────────────────────
  {
    definicion: {
      name: "estado_de_pedido",
      description:
        "El estado de un pedido (lo que pasa después del cierre de venta: aprobación de postventa, almacén, prueba, pago, despacho, instalación, puesta en marcha). Devuelve los pasos hechos y pendientes con quién los hizo, qué lo frena y a quién le toca, QUÉ LE FALTA EXACTAMENTE A CADA MÁQUINA para «Probada y embalada» (la misma verificación del botón), si la salida está trabada por pago, visto bueno de Finanzas o letras, y los enlaces a sus pantallas. Busca por número de pedido (PED-0024-2026 o ERP), por cliente o por código de cierre. Úsala para «¿en qué va el pedido de X?», «¿por qué no puedo marcar probada y embalada?», «¿por qué no se despacha?», «¿a quién le toca?».",
      input_schema: {
        type: "object",
        properties: {
          texto: { type: "string", description: "Número de pedido ERP (420-26), código de cierre (014-2026) o nombre del cliente." },
        },
        required: ["texto"],
      },
    },
    para: todos,
    aviso: (a) => `Revisando el pedido ${texto(a.texto)}`,
    ejecutar: async (args, quien) => {
      const supabase = await createClient();
      const q = texto(args.texto);
      const patron = patronSeguro(q);
      const { data: cierres } = /^\d{1,4}(-\d{2,4})?$/.test(q)
        ? await supabase.from("informes_cierre").select("id").ilike("codigo", `%${q}%`).limit(5)
        : { data: [] as { id: string }[] };
      const idsCierre = (cierres ?? []).map((c) => c.id);
      const filtros = [`numero_pedido_erp.ilike.${patron}`, `cliente_texto.ilike.${patron}`];
      if (idsCierre.length) filtros.push(`informe_cierre_id.in.(${idsCierre.join(",")})`);
      const { data } = await supabase
        .from("servicios_postventa")
        .select("*")
        .or(filtros.join(","))
        .order("created_at", { ascending: false })
        .limit(6);
      const filas = (data ?? []) as unknown as ServicioPostventa[];
      if (filas.length === 0) {
        return {
          resumen: `Ningún pedido visible con «${q}»`,
          datos: { nota: "No aparece un pedido con ese número, cierre o cliente que quien pregunta pueda ver." },
        };
      }
      const conCifras = verMontos(quien);
      const abiertos = filas.filter((s) => !s.completado && !s.cerrado_at);
      // Si son varios, la lista corta para que la persona elija; si es uno, el detalle.
      if (filas.length > 1 && abiertos.length !== 1) {
        const lista = filas.map((s) => {
          const frena = queLoFrena(s);
          return {
            pedido_erp: s.numero_pedido_erp,
            cliente: s.cliente_texto,
            equipo: s.equipo,
            terminado: Boolean(s.completado || s.cerrado_at),
            que_sigue: frena ? `${frena.texto} (le toca a ${etiquetaResponsable(frena.responsable)})` : null,
            enlaces: enlacesDelPedido(quien, s.id, s.cuenta_id),
          };
        });
        return { resumen: `${filas.length} pedidos con «${q}»`, datos: { varios: conCifras ? lista : taparMontos(lista) } };
      }
      const s = abiertos.length === 1 && filas.length > 1 ? abiertos[0] : filas[0];
      // Todo se calcula con el pedido COMPLETO, igual que los botones (el pago
      // decide si la apertura está trabada); las cifras se tapan recién en lo
      // que se le entrega al modelo.
      const pago = ETIQUETA_ESTADO_PAGO[estadoPago(s)];
      const nombres = await nombresDelPedido(s);
      const frena = queLoFrena(s);
      const circuito = circuitoDe(s);
      const bloques = bloquesPedido(s, nombres).map((b) => ({
        etapa: b.titulo,
        completa: b.completo,
        pasos: b.pasos.map((p) => ({
          paso: p.etiqueta,
          responsable: etiquetaResponsable(p.responsable),
          hecho: p.hecho,
          cuando: fechaLima(p.cuando),
          quien: p.quien ?? null,
          trabado_porque: p.trabado ?? null,
          detalle: p.detalle ?? null,
        })),
      }));

      // QUÉ LE FALTA A CADA MÁQUINA PARA «PROBADA Y EMBALADA» (14-10). Se le
      // pregunta a la base con la MISMA función que frena el botón
      // (protocolo_falta_para_probar), así la respuesta es exacta para este
      // pedido y no cambia cuando cambia la regla (0475, 0480 del mismo día).
      const { data: equiposCrudos } = await supabase
        .from("pedido_equipos")
        .select("id, orden, descripcion, serie, en_este_despacho, prueba_lista_at, parte_de, parte_nombre")
        .eq("servicio_id", s.id)
        .order("orden", { ascending: true });
      const equipos = (equiposCrudos ?? []) as {
        id: string;
        descripcion: string | null;
        serie: string | null;
        en_este_despacho: boolean | null;
        prueba_lista_at: string | null;
        parte_de: string | null;
        parte_nombre: string | null;
      }[];
      const maquinas = await Promise.all(
        equipos
          .filter((e) => !e.parte_de)
          .map(async (e) => {
            const pendiente = e.en_este_despacho !== false && !e.prueba_lista_at;
            let falta: string[] | null = null;
            if (pendiente) {
              const { data: f } = await supabase.rpc("protocolo_falta_para_probar", {
                p_item: e.id,
                p_protocolo_ref: null,
                p_fotos: [],
                p_partes: [],
              });
              falta = (f as string[] | null) ?? [];
            }
            return {
              maquina: e.descripcion,
              serie: e.serie,
              va_en_este_despacho: e.en_este_despacho !== false,
              probada_y_embalada: e.prueba_lista_at ? fechaLima(e.prueba_lista_at) : null,
              le_falta_para_probada_y_embalada: falta,
            };
          }),
      );

      const pagoDespacho = evaluarPagoParaDespacho(s);
      const datos = {
        pedido_erp: s.numero_pedido_erp ?? null,
        tipo: circuito.esAccesorio
          ? "accesorio"
          : circuito.esRepuesto
            ? "repuesto"
            : circuito.esServicio
              ? "servicio"
              : "equipo",
        cliente: s.cliente_texto,
        equipo: s.equipo,
        terminado: Boolean(s.completado || s.cerrado_at),
        que_lo_frena: frena ? { texto: frena.texto, le_toca_a: etiquetaResponsable(frena.responsable), grave: frena.grave } : null,
        estado_del_pago: pago,
        forma_de_pago: s.forma_pago,
        monto: s.monto,
        moneda: s.moneda,
        // Lo que frena la salida por plata, sin cifras: postventa y almacén
        // tienen que saber SI está trabado y por qué, no cuánto.
        bloqueos_de_salida: {
          pago_cubre_lo_pactado_antes_del_despacho: pagoDespacho.cubierto,
          salida_autorizada_con_saldo: Boolean(s.salida_autorizada_at),
          pide_visto_bueno_de_finanzas: pideVistoBuenoFinanzas(s),
          falta_visto_bueno_de_finanzas: faltaVistoBuenoFinanzas(s),
          letras_viajan_con_el_equipo_y_almacen_no_las_recibio: faltanLetrasEnAlmacen(s),
        },
        maquinas,
        etapas: bloques,
        enlaces: enlacesDelPedido(quien, s.id, s.cuenta_id),
        otros_pedidos_con_ese_texto: filas.length - 1,
      };
      return { resumen: `Pedido ${s.numero_pedido_erp ?? s.cliente_texto ?? ""}`.trim(), datos: conCifras ? datos : taparMontos(datos) };
    },
  },

  // ── 5. Qué equipos hay ──────────────────────────────────────────────────
  {
    definicion: {
      name: "productos_disponibles",
      description:
        "Busca equipos en el catálogo: marca, modelo, capacidad, si está activo y cuántos hay. Los precios de lista solo vienen si quien pregunta puede verlos. Úsala para «¿tenemos lavadoras de 30 kg?», «¿qué secadoras a gas manejamos?», «¿hay stock de la RX135?». Acepta la frase completa tal como la dijo la persona.",
      input_schema: {
        type: "object",
        properties: {
          texto: { type: "string", description: "Lo que busca: «lavadora 30 kg», «RX135», «secadora a gas primus»." },
          incluir_inactivos: { type: "boolean", description: "Por defecto false: solo los equipos que se pueden cotizar hoy." },
        },
        required: ["texto"],
      },
    },
    para: todos,
    aviso: (a) => `Buscando «${texto(a.texto)}» en el catálogo`,
    verCifras: verPreciosCatalogo,
    ejecutar: async (args, quien) => {
      const supabase = await createClient();
      const { equipos } = await cargarCatalogo(supabase);
      const base = args.incluir_inactivos === true ? equipos : equipos.filter((e) => e.activo);
      const consulta = texto(args.texto);
      const hallados = consulta ? buscarEquipos(base, consulta) : base;
      const TOPE = 15;
      const conCifras = verPreciosCatalogo(quien);
      return {
        resumen: `${hallados.length} equipo(s) para «${consulta}»`,
        datos: {
          encontrados: hallados.length,
          mostrados: Math.min(hallados.length, TOPE),
          equipos: hallados.slice(0, TOPE).map((e) => ({
            sku: e.sku,
            equipo: `${e.marca} ${e.modelo}`,
            nombre: e.nombre,
            capacidad: e.capacidad,
            segmento: e.segmento === "semi_industrial" ? "semi-industrial" : "industrial",
            calentamiento: e.calentamiento,
            ...(conCifras ? { precios_usd: e.precios.map((x) => ({ nivel: x.tier, precio: Math.round(x.precio) })) } : {}),
            en_almacen: e.disponibles,
            stock_del_maestro: e.stockReferencia,
            activo: e.activo,
          })),
          aviso:
            "Hay dos cifras de stock y son distintas: «en_almacen» es el conteo del almacén del CRM (null = ese modelo todavía no se cargó al almacén) y «stock_del_maestro» es la foto del maestro del día en que se cargó el catálogo, no un conteo de hoy. Al responder por disponibilidad, diga de cuál habla y que conviene confirmarla con Operaciones." +
            (conCifras ? "" : " Los precios no se muestran a esta área."),
        },
      };
    },
  },

  // ── 6. Mi semana (el comercial, sobre sí mismo) ─────────────────────────
  {
    definicion: {
      name: "mi_semana",
      description:
        "El cierre semanal de QUIEN PREGUNTA (solo comerciales, y solo de sí mismos): lo proyectado contra lo vendido, gestiones y cotizaciones contra su meta, ventas cerradas, oportunidades perdidas con su motivo, y lo que declaró. Úsala para «¿cómo voy esta semana?», «¿cuánto me falta para la meta?».",
      input_schema: {
        type: "object",
        properties: {
          lunes: { type: "string", description: "Lunes de la semana (2026-10-12). Por defecto, la actual." },
        },
        required: [],
      },
    },
    para: esComercialDeVenta,
    aviso: () => "Revisando su semana",
    // El comercial no elige de quién: siempre es él. Así no hay forma de
    // pedirle al asistente los números de un compañero.
    ejecutar: async (args, quien) => resumenSemana(quien.id, quien.nombre, quien.codigo_comercial, texto(args.lunes)),
  },

  // ── 7. Gerencia: el cierre de la semana de cualquiera ───────────────────
  {
    definicion: {
      name: "cierre_de_la_semana",
      description:
        "El cierre semanal de un comercial: lo proyectado contra lo vendido, las ventas cerradas, lo que quedó pendiente, las oportunidades perdidas con su motivo, y lo que declaró que va a hacer y qué necesita. Úsala para preguntas sobre la semana de alguien o sobre por qué no llegó a su meta.",
      input_schema: {
        type: "object",
        properties: {
          comercial: { type: "string", description: "Código (C1, C5) o parte del nombre." },
          lunes: { type: "string", description: "Lunes de la semana en formato 2026-08-31. Por defecto, la semana actual." },
        },
        required: ["comercial"],
      },
    },
    para: esGerencia,
    aviso: (a) => `Revisando la semana de ${texto(a.comercial)}`,
    ejecutar: async (args) => {
      const p = await buscarComercial(texto(args.comercial));
      if (!p) return { resumen: "No se encontró ese comercial", datos: null };
      return resumenSemana(p.id, p.nombre, p.codigo_comercial, texto(args.lunes));
    },
  },

  // ── 8. Gerencia: cómo le fue a un comercial ─────────────────────────────
  {
    definicion: {
      name: "resumen_de_comercial",
      description:
        "Cifras de un comercial en un período: cuánto vendió en dólares, cuántas ventas cerró, cuántos clientes compraron, ticket promedio y meta. Úsala para «cuánto vendió», «cómo va» de una persona.",
      input_schema: {
        type: "object",
        properties: {
          comercial: { type: "string", description: "Código (C1, C5) o parte del nombre (Brenda, Katerine)." },
          periodo: { type: "string", description: "semana, semana_anterior, mes, mes_anterior, 90d o anio. Por defecto: mes." },
        },
        required: ["comercial"],
      },
    },
    para: esGerencia,
    aviso: (a) => `Sacando las cifras de ${texto(a.comercial)}`,
    ejecutar: async (args) => {
      const p = await buscarComercial(texto(args.comercial));
      if (!p) return { resumen: "No se encontró ese comercial", datos: null };
      const preset = (texto(args.periodo) || "mes") as Parameters<typeof periodoPreset>[0];
      const periodo = periodoPreset(preset);
      const supabase = await createClient();
      const r = await cargarResumenGerencia(supabase, { ...periodo, preset, comercialId: p.id });
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

  // ── 9. Gerencia: el historial de semanas ────────────────────────────────
  {
    definicion: {
      name: "historial_de_semanas",
      description:
        "Las últimas doce semanas de un comercial: lo vendido, las gestiones, las cotizaciones y lo que declaró cada sábado (a qué se comprometió y qué pidió). Úsala para ver la evolución o si cumplió lo que dijo.",
      input_schema: {
        type: "object",
        properties: { comercial: { type: "string", description: "Código (C1, C5) o parte del nombre." } },
        required: ["comercial"],
      },
    },
    para: esGerencia,
    aviso: (a) => `Revisando las últimas semanas de ${texto(a.comercial)}`,
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

  // ── 10. Gerencia: el equipo de un vistazo ───────────────────────────────
  {
    definicion: {
      name: "comparar_comerciales",
      description:
        "Compara a todos los comerciales en un período: cuánto vendió cada uno, cuántas ventas y su meta. Úsala para «quién va mejor» o «cómo va el equipo».",
      input_schema: {
        type: "object",
        properties: {
          periodo: { type: "string", description: "semana, semana_anterior, mes, mes_anterior, 90d o anio. Por defecto: mes." },
        },
        required: [],
      },
    },
    para: esGerencia,
    aviso: () => "Comparando al equipo comercial",
    ejecutar: async (args) => {
      const preset = (texto(args.periodo) || "mes") as Parameters<typeof periodoPreset>[0];
      const periodo = periodoPreset(preset);
      const supabase = await createClient();
      const r = await cargarResumenGerencia(supabase, { ...periodo, preset });
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
];

async function resumenSemana(id: string, nombre: string, codigo: string | null, lunesTexto: string) {
  const lunes = lunesSemana(lunesTexto || undefined);
  const c = await cargarCierreSemanal(lunes, id);
  return {
    resumen: `${codigo ?? ""} · semana del ${c.lunes} al ${c.sabado}`.trim(),
    datos: {
      comercial: `${codigo ?? ""} · ${nombre}`,
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
      // Proyectar poco hace que «vendió más de lo proyectado» no signifique nada.
      aviso:
        c.medidas.venta.meta != null && c.proyectadoUsd < c.medidas.venta.meta * 0.33
          ? `Solo se proyectaron US$ ${Math.round(c.proyectadoUsd)} contra una meta semanal de US$ ${Math.round(c.medidas.venta.meta)}. El contraste proyectado/vendido dice poco mientras las oportunidades en negociación no tengan fecha de cierre.`
          : null,
    },
  };
}

/** Las herramientas que le tocan a esta persona, en orden fijo (el orden es parte del caché). */
export function herramientasPara(quien: Quien): Anthropic.Tool[] {
  return HERRAMIENTAS.filter((h) => h.para(quien)).map((h) => h.definicion);
}

export function avisoDe(nombre: string, args: Record<string, unknown>): string {
  const h = HERRAMIENTAS.find((x) => x.definicion.name === nombre);
  return h ? h.aviso(args) : "Consultando el CRM";
}

export async function ejecutarHerramienta(
  nombre: string,
  argumentos: Record<string, unknown>,
  quien: Quien,
): Promise<Evidencia> {
  const h = HERRAMIENTAS.find((x) => x.definicion.name === nombre);
  // Una herramienta que no le toca a esta persona se trata igual que una que
  // no existe: el modelo no la tenía en su lista, así que si la pide es un error.
  if (!h || !h.para(quien)) {
    return { herramienta: nombre, argumentos, resumen: "Esa consulta no está disponible", datos: null };
  }
  const r = await h.ejecutar(argumentos ?? {}, quien);
  // Última red: aunque una herramienta se olvide de tapar, a quien no ve
  // montos no le llegan.
  const datos = (h.verCifras ?? verMontos)(quien) ? r.datos : taparMontos(r.datos);
  return { herramienta: nombre, argumentos, resumen: r.resumen, datos };
}
