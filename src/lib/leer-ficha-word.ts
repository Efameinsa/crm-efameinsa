import type { EquipoEditable } from "@/components/crm/ficha-tecnica-editor";
import { prepararFoto } from "@/lib/foto-producto";

/**
 * Leer una ficha de Word y devolverla como el equipo que propone.
 *
 * Vive acá, y no dentro del botón del catálogo, porque hay DOS lugares que
 * sueltan un Word: la barra de arriba —para empezar un equipo nuevo— y la
 * propia hoja abierta, cuando Lesly se dio cuenta de que trajo el archivo
 * equivocado y quiere cambiarlo sin salir. Los dos tienen que acomodar el
 * contenido igual.
 *
 * El servidor lee el .docx (`/api/fichas/leer-word`, el mismo lector del
 * pipeline). Acá se hace lo que solo puede hacerse en el navegador: recortar la
 * foto como la muestra el Word.
 */
export interface FichaLeida {
  /** Lo que hay que volcar en la hoja. */
  equipo: Pick<
    EquipoEditable,
    | "nombre"
    | "marca"
    | "modelo"
    | "sku"
    | "categoria"
    | "segmento"
    | "capacidad"
    | "panel"
    | "controles"
    | "calentamiento"
    | "fichaTexto"
    | "leidaDe"
    | "fotoLista"
    | "fotoUrl"
  >;
  /** Cuántas líneas de descripción trajo, para decírselo. */
  bloques: number;
  /** El Word traía una imagen que el navegador no supo abrir. */
  fotoIlegible: boolean;
}

/**
 * La foto sale de acá YA ACOMODADA a la caja de la hoja, no cruda.
 *
 * Es lo que le permite a la hoja de edición recibirla como estado inicial y no
 * tener que aplicarla dentro de un efecto: recortar, redimensionar y crear la
 * URL para verla son cosas que no se pueden hacer mientras React dibuja, y
 * hacerlas acá —en el navegador, antes de abrir la hoja— las deja resueltas.
 */
export async function leerFichaDeWord(archivo: File): Promise<FichaLeida> {
  const cuerpo = new FormData();
  cuerpo.append("ficha", archivo);
  const r = await fetch("/api/fichas/leer-word", { method: "POST", body: cuerpo });
  const datos = await r.json().catch(() => ({ error: "El servidor no contestó lo esperado" }));
  if (!r.ok) throw new Error(datos.error ?? "No se pudo leer esa ficha");

  const recortada = await recortarComoElWord(datos.foto, archivo.name);
  const lista = recortada ? await prepararFoto(recortada) : null;

  return {
    equipo: {
      nombre: datos.nombre ?? "",
      marca: datos.cabecera.marca ?? "",
      modelo: datos.cabecera.modelo ?? "",
      sku: datos.sku ?? null,
      categoria: datos.categoria ?? null,
      segmento: datos.segmento ?? "industrial",
      capacidad: datos.cabecera.capacidad ?? null,
      panel: datos.cabecera.panel ?? null,
      controles: datos.cabecera.controles ?? null,
      calentamiento: datos.cabecera.calentamiento ?? null,
      fichaTexto: datos.fichaTexto || "# CARACTERÍSTICAS\n- ",
      leidaDe: datos.archivo,
      fotoLista: lista?.archivo ?? null,
      fotoUrl: lista ? URL.createObjectURL(lista.archivo) : null,
    },
    bloques: datos.bloques ?? 0,
    fotoIlegible: Boolean(datos.foto) && !lista,
  };
}

/**
 * La foto tal como se ve en el Word: los bytes que manda el servidor, cortados
 * por el rectángulo que el propio documento declara.
 *
 * Word no guarda la imagen recortada: guarda el archivo entero y un rectángulo
 * que dice qué parte se ve, y ESE recorte es la foto que Lesly eligió al armar
 * la ficha (sin él vuelven las franjas del catálogo y el logo pegado al
 * equipo). El recorte se hace acá porque el canvas del navegador ya está —el
 * servidor necesitaría una biblioteca de imágenes solo para esto— y es el mismo
 * que después acomoda la foto a la caja de la hoja.
 *
 * Devuelve `null` cuando el navegador no sabe abrir esa imagen —los metarchivos
 * EMF de dos fichas antiguas—, que es la forma honesta de decir «esta no» sin
 * romper la carga entera.
 */
async function recortarComoElWord(
  foto: { tipo: string; base64: string; recorte: { l: number; t: number; r: number; b: number } | null } | null,
  nombreFicha: string,
): Promise<File | null> {
  if (!foto) return null;
  const bytes = Uint8Array.from(atob(foto.base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: foto.tipo });
  const base = nombreFicha.replace(/\.docx$/i, "");

  if (!foto.recorte) return new File([blob], `${base}.png`, { type: foto.tipo });

  const imagen = await new Promise<HTMLImageElement | null>((res) => {
    const url = URL.createObjectURL(blob);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      res(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      res(null);
    };
    img.src = url;
  });
  if (!imagen) return null;

  const { l, t, r, b } = foto.recorte;
  const x = Math.round(imagen.width * l);
  const y = Math.round(imagen.height * t);
  const ancho = Math.max(1, Math.round(imagen.width * (1 - l - r)));
  const alto = Math.max(1, Math.round(imagen.height * (1 - t - b)));

  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) return null;
  // Fondo blanco: la hoja se imprime sobre papel y una imagen con transparencia
  // guardada como JPEG sale con el fondo negro.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(imagen, x, y, ancho, alto, 0, 0, ancho, alto);

  const recortada = await new Promise<Blob | null>((res) => lienzo.toBlob(res, "image/png"));
  if (!recortada) return null;
  return new File([recortada], `${base}.png`, { type: "image/png" });
}
