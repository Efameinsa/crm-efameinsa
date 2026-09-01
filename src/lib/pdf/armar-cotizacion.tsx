import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { CotizacionPdf, type ItemPdf, type SeccionFicha, type BloqueFicha } from "@/lib/pdf/cotizacion-pdf";
import { correoEnSerie } from "@/lib/pdf/series";

/**
 * El armado del PDF de una cotización, separado de la ruta que lo sirve.
 *
 * POR QUÉ SE SEPARÓ (28-08). Operaciones necesita ver «cómo quedaría esto en
 * una cotización» antes de que exista la cotización —es la forma de comprobar
 * que una ficha recién cargada sale bien—, y la única vista previa que sirve es
 * el documento de verdad: una imitación aprobaría fichas que después salen
 * mal. Así que en vez de dibujar una copia parecida, las dos pantallas arman el
 * MISMO documento con el mismo código; lo único que cambia es de dónde salen
 * los datos: de la base en un caso, de un ejemplo en el otro.
 *
 * No se cambió ni una línea del armado al moverlo — se verificó comparando byte
 * a byte tres cotizaciones reales antes y después.
 */

const LOGO_BUFFER = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));


// Fotos de producto: viven en public/productos/ (repo) y foto_path guarda la
// ruta pública ("/productos/x.png"). basename() evita salirse de la carpeta
// aunque foto_path viniera manipulado. En Vercel la carpeta se incluye vía
// outputFileTracingIncludes (next.config.ts).
function leerFotoProducto(fotoPath: string | null): Buffer | null {
  if (!fotoPath) return null;
  if (fotoPath.startsWith(PREFIJO_SUBIDA)) return null; // esa se baja aparte, ver bajarFotoSubida
  try {
    return readFileSync(join(process.cwd(), "public", "productos", basename(fotoPath)));
  } catch {
    return null; // foto declarada pero archivo ausente: el PDF sale sin foto
  }
}

/**
 * Las fotos subidas desde la pantalla (migración 0121).
 *
 * Las 296 que vinieron con el proyecto viven en `public/productos/` y se leen
 * del disco. Las que carga operaciones no pueden vivir ahí —en producción el
 * disco es de solo lectura— así que van al almacenamiento y su `foto_path`
 * empieza con «storage:». El PDF tiene que poder imprimir las dos sin
 * enterarse de la diferencia.
 */
export const PREFIJO_SUBIDA = "storage:";

async function bajarFotoSubida(fotoPath: string | null): Promise<Buffer | null> {
  if (!fotoPath || !fotoPath.startsWith(PREFIJO_SUBIDA)) return null;
  const ruta = fotoPath.slice(PREFIJO_SUBIDA.length);
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  try {
    const r = await fetch(`${base}/storage/v1/object/public/productos/${ruta}`);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null; // sin foto antes que sin cotización
  }
}

// Logo del fabricante (UniMac, Primus…), junto a la foto del equipo — estaba
// en la ficha original y faltaba en la cotización (reportado 26-08 con la
// SECU1202 al lado del Word).
//
// NO es por marca: se probó así primero y salió mal en la 1SECU1701 — su
// propia foto YA trae el logo impreso encima (es una foto de catálogo del
// fabricante), y el logo agregado quedaba duplicado (unimac-mal.png en la
// captura que mandó Darwin). Cada foto de producto es distinta: unas ya
// traen el logo, otras no. Por eso, igual que el panel, va por producto —
// public/productos/<sku>-logo.png— y solo existe donde alguien miró la foto y
// confirmó que hace falta agregarlo.
function leerLogoMarca(sku: string | null | undefined): Buffer | null {
  if (!sku) return null;
  try {
    return readFileSync(join(process.cwd(), "public", "productos", `${sku.toLowerCase()}-logo.png`));
  } catch {
    return null;
  }
}

// Foto del panel de control (UniLinc Touch, X Control…), junto a la foto del
// equipo — reportado 26-08 puntualmente para la SECU1202, con su ficha al
// lado (V:\...\UT120\SECU1202....docx) para confirmar que esa imagen SÍ está
// en ESA ficha. NO es una imagen genérica por nombre de panel: dos equipos
// con el mismo panel («UNILINC TOUCH») pueden tener fichas .docx distintas, y
// que una no traiga foto de panel no significa que la otra tampoco —
// corregido el mismo 26-08 tras verse en la SECU1701, que heredó por error la
// foto de la SECU1202 solo por compartir el nombre del panel. Por eso vive en
// public/productos/<sku>-panel.png —igual que foto_path, por producto— y solo
// existe el archivo para las fichas donde alguien confirmó la imagen a mano.
// Es opcional: si no está el archivo, la ficha sale sin esa imagen y nada más.
function leerImagenPanel(sku: string | null | undefined): Buffer | null {
  if (!sku) return null;
  try {
    return readFileSync(join(process.cwd(), "public", "productos", `${sku.toLowerCase()}-panel.png`));
  } catch {
    return null;
  }
}

/** La cotización tal como la devuelve la consulta de la ruta. */
export interface CotizacionParaPdf {
  codigo: string | null;
  correlativo: number | null;
  serie: "EFAMEINSA" | "OPEN";
  moneda: string;
  condiciones: string | null;
  vigencia_dias: number;
  entrega_lugar: string | null;
  tiempo_entrega: string | null;
  garantia: string | null;
  forma_pago: string | null;
  saldo: string | null;
  cliente_snapshot: unknown;
  created_at: string;
  cotizacion_items: unknown;
  oportunidades: unknown;
  perfiles: unknown;
}

export async function renderizarCotizacionPdf(cotizacion: CotizacionParaPdf): Promise<Buffer> {
  const snapshot = cotizacion.cliente_snapshot as {
    razon_social: string;
    tipo_doc: string;
    num_doc: string | null;
    direccion: string | null;
  };

  // Datos de contacto: del contacto principal actual de la cuenta (no van en el
  // snapshot porque son datos de comunicación, no de identidad fiscal).
  const contactos =
    ((cotizacion.oportunidades as unknown as {
      cuentas: { contactos: { nombre: string; telefono: string | null; email: string | null; es_principal: boolean }[] } | null;
    } | null)?.cuentas?.contactos ?? []);
  const contactoPrincipal = contactos.find((c) => c.es_principal) ?? contactos[0] ?? null;

  const perfilComercial = cotizacion.perfiles as unknown as {
    nombre: string;
    cargo: string | null;
    telefono: string | null;
    celular: string | null;
    email_contacto: string | null;
    email_open: string | null;
  } | null;

  function listaDeFicha(ficha: Record<string, unknown> | null | undefined, clave: string): string[] {
    const valor = ficha?.[clave];
    return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
  }

  function textoDeFicha(ficha: Record<string, unknown> | null | undefined, clave: string): string | null {
    const valor = ficha?.[clave];
    return typeof valor === "string" && valor ? valor : null;
  }

  const CLAVES_SECCION = ["caracteristicas", "disenoConstruccion", "dimensiones", "medidas"] as const;
  type ClaveSeccion = (typeof CLAVES_SECCION)[number];

  function ordenDeFicha(ficha: Record<string, unknown> | null | undefined): ClaveSeccion[] | null {
    const valor = ficha?.ordenSecciones;
    if (!Array.isArray(valor)) return null;
    const claves = valor.filter((v): v is ClaveSeccion => CLAVES_SECCION.includes(v as ClaveSeccion));
    return claves.length === CLAVES_SECCION.length ? claves : null;
  }

  /**
   * Las torres lavadora-secadora son dos máquinas y su ficha trae un bloque
   * para cada una (`ficha.secciones`). Se pasan tal cual para que el PDF las
   * imprima rotuladas; un equipo simple no tiene esta clave y sale como
   * siempre.
   */
  function seccionesDeFicha(ficha: Record<string, unknown> | null | undefined): SeccionFicha[] | undefined {
    const valor = ficha?.secciones;
    if (!Array.isArray(valor) || valor.length < 2) return undefined;
    return valor.map((s) => {
      const sec = s as Record<string, unknown>;
      return {
        titulo: typeof sec.titulo === "string" ? sec.titulo : null,
        caracteristicas: listaDeFicha(sec, "caracteristicas"),
        caracteristicasTitulo: textoDeFicha(sec, "caracteristicasTitulo"),
        disenoConstruccion: listaDeFicha(sec, "disenoConstruccion"),
        dimensiones: listaDeFicha(sec, "dimensiones"),
        dimensionesTitulo: textoDeFicha(sec, "dimensionesTitulo"),
        medidas: listaDeFicha(sec, "medidas"),
        medidasTitulo: textoDeFicha(sec, "medidasTitulo"),
        ordenSecciones: ordenDeFicha(sec),
      };
    });
  }

  // La ficha en papel de MUCHOS equipos abre "ESPECIFICACIONES TÉCNICAS" con
  // la capacidad ("Capacidad: 55 kg"), pero el parser que arma
  // `ficha.dimensiones` la descarta a propósito (la confunde con el rótulo
  // repetido de la tabla de cabecera — ver esRotuloDeTabla en
  // extraer-ficha-tecnica.mjs). En vez de arreglar esa extracción línea por
  // línea, se antepone acá con el dato que YA es confiable:
  // `productos.capacidad`, la misma columna que usa la tabla de arriba del
  // PDF.
  //
  // Pero NO todas las fichas traen esa línea ahí (reportado 26-08 con la
  // LAV180-V1/LAV1801: su Word nunca menciona la capacidad dentro de
  // ESPECIFICACIONES TÉCNICAS, solo en la tabla de cabecera) — para esas,
  // `ficha.sinCapacidadEnEspecificaciones` desactiva el agregado y se
  // respeta el Word tal cual.
  function dimensionesConCapacidad(ficha: Record<string, unknown> | null | undefined, capacidad: string | null): string[] {
    const lista = listaDeFicha(ficha, "dimensiones");
    if (!capacidad) return lista;
    if (ficha?.sinCapacidadEnEspecificaciones === true) return lista;
    if (lista.some((l) => /^capacidad\s*:/i.test(l))) return lista;
    return [`Capacidad: ${capacidad}`, ...lista];
  }

  /**
   * La foto del color que se eligió para este cliente (migración 0088). Los
   * coches de transporte tienen una foto por color en `ficha.fotos_por_color`;
   * sin color elegido —o si ese color no tiene foto propia— se usa la del
   * producto, como siempre. `leerFotoProducto` valida la ruta igual.
   */
  function fotoDelItem(
    ficha: Record<string, unknown> | null | undefined,
    color: string | null,
    fotoPath: string | null,
  ): string | null {
    if (!color) return fotoPath;
    const mapa = ficha?.fotos_por_color;
    if (typeof mapa !== "object" || mapa === null) return fotoPath;
    const ruta = (mapa as Record<string, unknown>)[color];
    return typeof ruta === "string" ? ruta : fotoPath;
  }

  const items: ItemPdf[] = await Promise.all((
    cotizacion.cotizacion_items as unknown as {
      cantidad: number;
      precio_unitario: number;
      descripcion: string | null;
      color: string | null;
      productos: {
        sku: string;
        marca: string;
        modelo: string;
        nombre: string;
        capacidad: string | null;
        categoria: string | null;
        ficha: Record<string, unknown> | null;
        foto_path: string | null;
      } | null;
    }[]
  ).map(async (item) => {
    const ficha = item.productos?.ficha;
    return {
      // Equipo escrito a mano (migración 0062): no está en el catálogo
      // todavía, así que lo único que lo describe es lo que tecleó el
      // comercial. Sin ficha, no genera página de especificaciones.
      nombre: item.productos?.nombre ?? item.descripcion ?? "Producto",
      marca: item.productos?.marca ?? "—",
      modelo: item.productos?.modelo ?? "—",
      capacidad: item.productos?.capacidad ?? null,
      categoria: item.productos?.categoria ?? null,
      calentamiento: textoDeFicha(ficha, "calentamiento"),
      montaje: textoDeFicha(ficha, "montaje"),
      panel: textoDeFicha(ficha, "panel"),
      controles: textoDeFicha(ficha, "controles"),
      colores: listaDeFicha(ficha, "colores"),
      color: item.color,
      caracteristicas: listaDeFicha(ficha, "caracteristicas"),
      caracteristicasTitulo: textoDeFicha(ficha, "caracteristicasTitulo"),
      disenoConstruccion: listaDeFicha(ficha, "disenoConstruccion"),
      dimensiones: dimensionesConCapacidad(ficha, item.productos?.capacidad ?? null),
      dimensionesTitulo: textoDeFicha(ficha, "dimensionesTitulo"),
      medidas: listaDeFicha(ficha, "medidas"),
      medidasTitulo: textoDeFicha(ficha, "medidasTitulo"),
      ordenSecciones: ordenDeFicha(ficha),
      // La descripción leída del Word tal como está (paso 3 de fichas-v). Cuando
      // existe manda sobre los cuatro cajones de arriba: es la ficha en su
      // orden, con sus títulos, subtítulos y viñetas.
      bloques: Array.isArray(ficha?.bloques) ? (ficha.bloques as BloqueFicha[]) : undefined,
      secciones: seccionesDeFicha(ficha),
      // Del disco o del almacenamiento, según de dónde venga (0121).
      fotoBuffer:
        leerFotoProducto(fotoDelItem(ficha, item.color, item.productos?.foto_path ?? null)) ??
        (await bajarFotoSubida(fotoDelItem(ficha, item.color, item.productos?.foto_path ?? null))),
      logoMarcaBuffer: leerLogoMarca(item.productos?.sku ?? null),
      panelImagenBuffer: leerImagenPanel(item.productos?.sku ?? null),
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
    };
  }));

  const creada = new Date(cotizacion.created_at);
  // Numeración del documento impreso como en los modelos: "{correlativo}-{yy}".
  // Un borrador todavía no tiene número —se le asigna al enviarlo, migración
  // 0064— y sale marcado como tal: si alguien imprime un borrador, tiene que
  // ser imposible confundirlo con el documento que se le mandó al cliente.
  // Las cuentas de práctica numeran en su propia serie (migración 0145): el
  // código ya dice PRUEBA_1-26 y eso es lo que se imprime, para que un PDF de
  // ensayo no se pueda confundir nunca con uno que salió a un cliente.
  const numeroDocumento =
    cotizacion.codigo?.startsWith("PRUEBA")
      ? cotizacion.codigo
      : cotizacion.correlativo != null
        ? `${cotizacion.correlativo}-${String(creada.getFullYear()).slice(-2)}`
        : null;
  const fecha = creada.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

  const buffer = await renderToBuffer(
    <CotizacionPdf
      logoBuffer={LOGO_BUFFER}
      serie={cotizacion.serie}
      numeroDocumento={numeroDocumento}
      fecha={fecha}
      cliente={{
        razon_social: snapshot.razon_social,
        tipo_doc: snapshot.tipo_doc,
        num_doc: snapshot.num_doc,
        direccion: snapshot.direccion,
        telefono: contactoPrincipal?.telefono ?? null,
        email: contactoPrincipal?.email ?? null,
        atencion: contactoPrincipal?.nombre ?? null,
      }}
      items={items}
      moneda={cotizacion.moneda}
      condiciones={cotizacion.condiciones}
      vigenciaDias={cotizacion.vigencia_dias}
      entregaLugar={cotizacion.entrega_lugar}
      garantia={cotizacion.garantia}
      tiempoEntrega={cotizacion.tiempo_entrega}
      formaPago={cotizacion.forma_pago}
      saldo={cotizacion.saldo}
      firma={{
        nombre: perfilComercial?.nombre ?? "Área Comercial",
        cargo: perfilComercial?.cargo ?? null,
        telefono: perfilComercial?.telefono ?? null,
        celular: perfilComercial?.celular ?? null,
        // El dominio del correo cambia con la razón social con la que se
        // cotiza — salvo quien tenga cargado su correo de OPEN, que no siempre
        // cambia de dominio (ver correoEnSerie en series.ts).
        email: correoEnSerie(
          perfilComercial?.email_contacto ?? null,
          cotizacion.serie,
          perfilComercial?.email_open ?? null,
        ),
      }}
    />,
  );;

  return buffer;
}
