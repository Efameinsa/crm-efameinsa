import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
// Los lectores son .mjs y sin tipos a propósito: son los MISMOS archivos que
// importan los scripts del pipeline, que corren con node pelado. Duplicarlos en
// TypeScript sería tener dos lecturas, que es justo lo que no puede pasar.
import { leerZip, textoDeZip } from "@/lib/fichas/zip.mjs";
import { leerFichaDeXml } from "@/lib/fichas/ficha-docx.mjs";
import { imagenesDeDocx, repartirRoles } from "@/lib/fichas/imagenes-docx.mjs";
import { codigoYNombre } from "@/lib/fichas/nombre-de-ficha";
import { clasificar } from "@/lib/fichas/clasificar.mjs";
import { bloquesATexto, type BloqueFicha } from "@/lib/ficha-texto";

/** La tabla de arriba de la ficha, tal como la lee `ficha-docx.mjs`. */
interface CabeceraFicha {
  marca?: string | null;
  modelo?: string | null;
  capacidad?: string | null;
  panel?: string | null;
  controles?: string | null;
  calentamiento?: string | null;
  /** Los rótulos propios de la familia, que no son de la lista conocida. */
  extra?: { rotulo: string; valor: string }[];
}

/** Una imagen del Word: los bytes enteros y el recorte que declara el documento. */
interface ImagenFicha {
  entrada: string;
  recorte: { l: number; t: number; r: number; b: number } | null;
  originales: Buffer;
}

export const runtime = "nodejs";

/**
 * Leer una ficha técnica de Word y devolverla acomodada.
 *
 * Pedido de Santos (31-08): «en la vista de Lesly prepara una opción para
 * agregar productos que ya tiene… un botón que diga subir Word o subir ficha,
 * donde pueda arrastrar en drag and drop la ficha y el sistema lo lea y acomode
 * el contenido por defecto en su vista de edición para que le sea más fácil».
 *
 * ES EL MISMO LECTOR DEL PIPELINE, no una imitación. `src/lib/fichas/` tiene el
 * lector del texto y el de las imágenes, y de ahí los toman tanto
 * `scripts/fichas-v-03-extraer.mjs` —que leyó las 122 fichas del catálogo—
 * como esta ruta. Una segunda lectura «parecida» acomodaría distinto lo que ya
 * está cargado, que es exactamente lo que no puede pasar: Lesly compara.
 *
 * VUELVEN LAS TRES IMÁGENES DE LA FICHA, no solo la del equipo: el logo del
 * fabricante y la vista del panel de control son parte de la hoja impresa
 * —cajas de 27 × 14 mm y 35 × 32 mm en `cotizacion-pdf.tsx`— y estaban en el
 * Word desde el principio. Devolver solo la grande hacía que un equipo cargado
 * desde esta pantalla saliera en la cotización sin logo y sin panel, mientras
 * el mismo equipo cargado por el pipeline sí los tenía: «al subir este
 * producto con el Word no carga completo la imagen» (operaciones, 09-09, con
 * la SECU75E3). Cuál es cuál lo decide `repartirRoles`, con el criterio del
 * paso 4 del pipeline.
 *
 * LAS FOTOS VIAJAN SIN RECORTAR, con su recorte al lado. Word no guarda la
 * imagen recortada: guarda el archivo entero y un rectángulo que dice qué
 * parte se ve, y ese recorte es la foto que Lesly eligió. Recortar acá pediría
 * una biblioteca de imágenes en el servidor; el navegador ya tiene canvas y
 * encima es donde la foto se termina de acomodar antes de subirla
 * (`prepararFoto`).
 *
 * NO ESCRIBE NADA. Lee el archivo que llega y contesta. El equipo se crea
 * recién cuando Lesly revisa lo que salió y pulsa guardar.
 */

/** Un Word de ficha pesa entre 200 KB y 2 MB; 25 deja margen de sobra. */
const MAXIMO_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
  const rol = perfil?.rol as string | undefined;
  if (!rol || !["operaciones", "gerencia", "admin"].includes(rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const formulario = await request.formData().catch(() => null);
  const archivo = formulario?.get("ficha");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (!/\.docx$/i.test(archivo.name)) {
    // El .doc viejo no es un zip: es el formato binario de Word 97 y hay que
    // convertirlo con Word. Se dice cuál es el camino en vez de fallar raro.
    return NextResponse.json(
      {
        error: /\.doc$/i.test(archivo.name)
          ? "Esa ficha es .doc, el formato viejo. Ábrala en Word y guárdela como .docx; recién ahí se puede leer."
          : "Eso no es una ficha de Word (.docx).",
      },
      { status: 400 },
    );
  }
  if (archivo.size > MAXIMO_BYTES) {
    return NextResponse.json({ error: `El archivo pesa ${Math.round(archivo.size / 1024 / 1024)} MB y el tope son 25.` }, { status: 400 });
  }

  let leida;
  try {
    const zip = leerZip(Buffer.from(await archivo.arrayBuffer()));
    const xml = textoDeZip(zip, "word/document.xml");
    if (!xml) throw new Error("el archivo no tiene el cuerpo del documento");
    const { cabecera, bloques, tablaDe } = leerFichaDeXml(xml);
    const roles = repartirRoles(imagenesDeDocx(zip, xml, tablaDe)) as {
      logo: ImagenFicha | null;
      foto: ImagenFicha | null;
      panel: ImagenFicha | null;
    };
    leida = { cabecera: cabecera as CabeceraFicha, bloques: bloques as BloqueFicha[], roles };
  } catch (e) {
    return NextResponse.json(
      { error: `No se pudo leer esa ficha: ${e instanceof Error ? e.message : String(e)}` },
      { status: 422 },
    );
  }

  const { cabecera, bloques, roles } = leida;

  // CÓMO SE LLAMA EL EQUIPO. La tabla de arriba del Word trae marca, modelo y
  // capacidad, pero no el nombre ni el código: esos los pone Lesly al bautizar
  // el archivo —«SECU75E3. SECADORA UT075-DUAL DIGITAL-…»— y de ahí se
  // proponen, con las dos formas de separarlos que ella usa (ver
  // `nombre-de-ficha.ts`). Proponer es lo que le ahorra el trabajo; el resto
  // del nombre del archivo son las características, que ya están en la ficha.
  const sinExtension = archivo.name.replace(/\.docx$/i, "");
  const { sku: codigo, nombre } = codigoYNombre(archivo.name);
  const { categoria, segmento } = clasificar(`${sinExtension} ${cabecera.modelo ?? ""}`);

  return NextResponse.json({
    archivo: archivo.name,
    sku: codigo,
    nombre,
    categoria,
    segmento,
    cabecera: {
      marca: cabecera.marca ?? null,
      modelo: cabecera.modelo ?? null,
      capacidad: cabecera.capacidad ?? null,
      panel: cabecera.panel ?? null,
      controles: cabecera.controles ?? null,
      calentamiento: cabecera.calentamiento ?? null,
      // Los rótulos propios de esa familia de equipos —«Dimensión de mesa»,
      // «Presión de trabajo»— que no son ninguna de las seis conocidas.
      extra: cabecera.extra ?? [],
    },
    // La descripción con la misma sintaxis que ya se edita en pantalla, para
    // que caiga en el cuadro de texto sin traducción de por medio.
    fichaTexto: bloquesATexto(bloques),
    bloques: bloques.length,
    // Las tres cajas de la hoja impresa: logo del fabricante, foto del equipo
    // y vista del panel. Las que la ficha no traiga vuelven en null.
    logo: paraElNavegador(roles.logo),
    foto: paraElNavegador(roles.foto),
    panel: paraElNavegador(roles.panel),
  });
}

/** Una imagen del Word como la recibe la pantalla: bytes y recorte declarado. */
function paraElNavegador(imagen: ImagenFicha | null) {
  if (!imagen) return null;
  return {
    tipo: tipoDeImagen(imagen.entrada),
    recorte: imagen.recorte,
    base64: Buffer.from(imagen.originales).toString("base64"),
  };
}

function tipoDeImagen(entrada: string): string {
  const ext = (entrada.match(/\.([a-z0-9]+)$/i)?.[1] ?? "png").toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "emf" || ext === "wmf") return "image/x-emf";
  return "image/png";
}
