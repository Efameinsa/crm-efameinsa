import type Anthropic from "@anthropic-ai/sdk";
import { toFile } from "@anthropic-ai/sdk";
import sharp from "sharp";
import * as XLSX from "xlsx";
import { leerZip, textoDeZip } from "@/lib/fichas/zip.mjs";
import { parrafosDeXml } from "@/lib/fichas/ficha-servicio.mjs";
import { clienteClaude } from "@/lib/asistente/claude";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * LO QUE LA PERSONA ADJUNTA A SU PREGUNTA (Santos, 14-10): fotos, PDF, Word.
 * Se suma Excel y texto, que son lo mismo para quien pregunta: «mire esto».
 *
 * CÓMO LE LLEGA A CLAUDE:
 *   · Fotos y PDF se suben a la API de archivos de Anthropic y la pregunta los
 *     cita por su id. Así el hilo guardado (0479) no carga megas en base64 y,
 *     sobre todo, no cambia: la conversación con el modelo tiene que repetirse
 *     idéntica en cada pregunta siguiente o Anthropic rechaza el historial.
 *   · Word y Excel no los lee Claude directo: se extrae el texto acá (el mismo
 *     lector de Word que usan las fichas técnicas) y va como documento de texto.
 *     Las imágenes que trae un Word no viajan; se avisa.
 *
 * LA AUDITORÍA. Una copia de cada archivo queda en el almacenamiento del CRM
 * (bucket «adjuntos», carpeta asistente/) para que admin vea qué se adjuntó.
 *
 * LAS FOTOS SE ACHICAN a 2000 px de lado. Una foto de celular pesa 4-6 MB y
 * Claude no ve más detalle que eso: subirla entera solo cuesta tiempo y tokens.
 */

export const MAX_ARCHIVOS = 5;
export const MAX_MB = 15;

export interface AdjuntoGuardado {
  nombre: string;
  tipo: string;
  bytes: number;
  ruta: string | null;
  como: "imagen" | "pdf" | "texto";
}

export class AdjuntoInvalido extends Error {}

const IMAGEN = /^image\/(jpeg|png|gif|webp|heic|heif)$/i;
const EXT_WORD = /\.docx$/i;
const EXT_EXCEL = /\.(xlsx|xls|csv)$/i;
const EXT_TEXTO = /\.(txt|md)$/i;

function tipoDe(a: File): "imagen" | "pdf" | "word" | "excel" | "texto" | null {
  if (IMAGEN.test(a.type) || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(a.name)) return "imagen";
  if (a.type === "application/pdf" || /\.pdf$/i.test(a.name)) return "pdf";
  if (EXT_WORD.test(a.name)) return "word";
  if (EXT_EXCEL.test(a.name)) return "excel";
  if (a.type.startsWith("text/") || EXT_TEXTO.test(a.name)) return "texto";
  return null;
}

/** Tope del texto que se le pasa de un Word o Excel: unas 40 páginas. */
const MAX_TEXTO = 120_000;
const recortar = (t: string) =>
  t.length > MAX_TEXTO ? `${t.slice(0, MAX_TEXTO)}\n\n[… el archivo sigue; se cortó aquí por largo]` : t;

function textoDeWord(buf: Buffer): string {
  const zip = leerZip(buf);
  const xml = textoDeZip(zip, "word/document.xml");
  if (!xml) throw new AdjuntoInvalido("No pude leer el Word. ¿Es un .docx? Los .doc antiguos hay que guardarlos como .docx.");
  return parrafosDeXml(xml).join("\n");
}

function textoDeExcel(buf: Buffer): string {
  const libro = XLSX.read(buf, { type: "buffer" });
  return libro.SheetNames.map((h) => `### Hoja «${h}»\n${XLSX.utils.sheet_to_csv(libro.Sheets[h], { blankrows: false })}`).join("\n\n");
}

async function subirAClaude(buf: Buffer, nombre: string, tipo: string): Promise<string> {
  const archivo = await clienteClaude().files.upload({ file: await toFile(buf, nombre, { type: tipo }) });
  return archivo.id;
}

async function guardarCopia(usuarioId: string, conversacionId: string, nombre: string, tipo: string, buf: Buffer): Promise<string | null> {
  try {
    const limpio = nombre.normalize("NFD").replace(/[^\w.\-]+/g, "_").slice(-80);
    const ruta = `asistente/${usuarioId}/${conversacionId}/${Date.now()}-${limpio}`;
    const { error } = await createAdminClient().storage.from("adjuntos").upload(ruta, buf, { contentType: tipo, upsert: false });
    if (error) {
      console.error("asistente: no se guardó la copia del adjunto:", error.message);
      return null;
    }
    return ruta;
  } catch (e) {
    console.error("asistente: no se guardó la copia del adjunto:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Revisa antes de procesar: cuántos, cuánto pesan y si son de un tipo que se lee. */
export function revisarAdjuntos(archivos: File[]): void {
  if (archivos.length > MAX_ARCHIVOS) throw new AdjuntoInvalido(`Puede adjuntar hasta ${MAX_ARCHIVOS} archivos por pregunta.`);
  for (const a of archivos) {
    if (a.size > MAX_MB * 1024 * 1024) throw new AdjuntoInvalido(`«${a.name}» pesa más de ${MAX_MB} MB.`);
    if (!tipoDe(a)) {
      throw new AdjuntoInvalido(
        `No puedo leer «${a.name}». Acepto fotos (JPG, PNG, WEBP), PDF, Word (.docx), Excel (.xlsx, .csv) y texto.`,
      );
    }
  }
}

/** Convierte los archivos en bloques para la pregunta y guarda la copia para auditoría. */
export async function prepararAdjuntos(
  archivos: File[],
  usuarioId: string,
  conversacionId: string,
): Promise<{ bloques: Anthropic.Beta.BetaContentBlockParam[]; guardados: AdjuntoGuardado[] }> {
  const bloques: Anthropic.Beta.BetaContentBlockParam[] = [];
  const guardados: AdjuntoGuardado[] = [];
  for (const a of archivos) {
    const tipo = tipoDe(a)!;
    let buf: Buffer = Buffer.from(await a.arrayBuffer());
    let mime = a.type || "application/octet-stream";
    const ruta = await guardarCopia(usuarioId, conversacionId, a.name, mime, buf);

    if (tipo === "imagen") {
      try {
        buf = await sharp(buf).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
        mime = "image/jpeg";
      } catch {
        throw new AdjuntoInvalido(`No pude abrir la foto «${a.name}». Pruebe con JPG o PNG.`);
      }
      const id = await subirAClaude(buf, a.name.replace(/\.\w+$/, "") + ".jpg", mime);
      bloques.push({ type: "image", source: { type: "file", file_id: id } });
      guardados.push({ nombre: a.name, tipo: mime, bytes: a.size, ruta, como: "imagen" });
    } else if (tipo === "pdf") {
      const id = await subirAClaude(buf, a.name, "application/pdf");
      bloques.push({ type: "document", source: { type: "file", file_id: id }, title: a.name });
      guardados.push({ nombre: a.name, tipo: "application/pdf", bytes: a.size, ruta, como: "pdf" });
    } else {
      let texto: string;
      try {
        texto = tipo === "word" ? textoDeWord(buf) : tipo === "excel" ? textoDeExcel(buf) : buf.toString("utf8");
      } catch (e) {
        if (e instanceof AdjuntoInvalido) throw e;
        throw new AdjuntoInvalido(`No pude leer «${a.name}». ¿Está dañado o protegido con clave?`);
      }
      if (!texto.trim()) throw new AdjuntoInvalido(`«${a.name}» no tiene texto que leer.`);
      const nota = tipo === "word" ? "\n\n[Se leyó solo el texto del Word; sus imágenes no se ven.]" : "";
      bloques.push({
        type: "document",
        source: { type: "text", media_type: "text/plain", data: recortar(texto) + nota },
        title: a.name,
      });
      guardados.push({ nombre: a.name, tipo: mime, bytes: a.size, ruta, como: "texto" });
    }
  }
  return { bloques, guardados };
}
