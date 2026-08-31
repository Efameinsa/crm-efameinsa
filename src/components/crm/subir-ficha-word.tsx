"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { EQUIPO_NUEVO, type EquipoEditable } from "@/components/crm/ficha-tecnica-editor";
import { cn } from "@/lib/utils";

/**
 * Cargar un equipo arrastrando su ficha de Word.
 *
 * Pedido de Santos (31-08): «una opción para agregar productos que ya tiene…
 * un botón que diga subir Word o subir ficha, donde pueda arrastrar en drag and
 * drop la ficha y el sistema lo lea y acomode el contenido por defecto en su
 * vista de edición para que le sea más fácil».
 *
 * LO QUE SE LLENA SOLO: marca, modelo, capacidad, panel, controles y toda la
 * descripción —títulos, subtítulos y viñetas en el mismo orden del Word—, más
 * la foto del equipo. Lo que NO: el precio y el código, que no salen de la
 * ficha. El precio vive en el maestro de Lesly y el código lo pone ella.
 *
 * NO CREA NADA. Abre la hoja de edición ya escrita; el equipo entra al catálogo
 * recién cuando Lesly la revisa y guarda. La ficha de Word es una propuesta,
 * no una carga automática: las fichas se contradicen entre sí más seguido de lo
 * que parece y la que decide es ella.
 *
 * LA FOTO SE RECORTA ACÁ, en el navegador. Word no guarda la imagen recortada:
 * guarda el archivo entero y un rectángulo que dice qué parte se ve, y ESE
 * recorte es la foto que Lesly eligió al armar la ficha (si no, vuelven las
 * franjas del catálogo y el logo pegado al equipo). El servidor manda los bytes
 * y el rectángulo; el recorte lo hace el canvas del navegador, que es el mismo
 * que después acomoda la foto a la caja de la hoja.
 */
export function SubirFichaWord({ onLeida }: { onLeida: (equipo: EquipoEditable) => void }) {
  const [leyendo, setLeyendo] = useState(false);
  const [encima, setEncima] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  async function leer(archivo: File) {
    setLeyendo(true);
    try {
      const cuerpo = new FormData();
      cuerpo.append("ficha", archivo);
      const r = await fetch("/api/fichas/leer-word", { method: "POST", body: cuerpo });
      const datos = await r.json().catch(() => ({ error: "El servidor no contestó lo esperado" }));
      if (!r.ok) {
        toast.error(datos.error ?? "No se pudo leer esa ficha");
        return;
      }

      const foto = await recortarComoElWord(datos.foto, archivo.name);
      if (datos.foto && !foto) {
        toast.warning("La ficha trae una imagen que el navegador no sabe abrir. Todo lo demás sí se leyó.");
      }

      onLeida({
        ...EQUIPO_NUEVO,
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
        fichaTexto: datos.fichaTexto || EQUIPO_NUEVO.fichaTexto,
        leidaDe: datos.archivo,
        fotoInicial: foto,
      });

      toast.success(
        `${datos.archivo}: ${datos.bloques} líneas de descripción${foto ? " y su foto" : ""}. Revise y guarde.`,
      );
    } catch (e) {
      toast.error(`No se pudo leer esa ficha: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLeyendo(false);
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setEncima(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void leer(f);
      }}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors",
        encima && "border-primary bg-primary/5 text-primary",
      )}
    >
      {leyendo ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : <FileUp className="size-3.5 shrink-0" />}
      <span className="hidden sm:inline">{encima ? "Suelte la ficha acá" : "¿Ya tiene la ficha en Word?"}</span>
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={leyendo}
        className="cursor-pointer font-medium text-foreground underline underline-offset-2 hover:text-primary disabled:opacity-60"
      >
        {leyendo ? "Leyendo la ficha…" : "Subir ficha (.docx)"}
      </button>
      <input
        ref={entrada}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void leer(f);
        }}
      />
    </div>
  );
}

/**
 * La foto tal como se ve en el Word: los bytes que manda el servidor, cortados
 * por el rectángulo que el propio documento declara.
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

  if (!foto.recorte) {
    return new File([blob], `${base}.png`, { type: foto.tipo });
  }

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
  // Fondo blanco: la hoja se imprime sobre papel y una imagen con
  // transparencia guardada como JPEG sale con el fondo negro.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(imagen, x, y, ancho, alto, 0, 0, ancho, alto);

  const recortada = await new Promise<Blob | null>((res) => lienzo.toBlob(res, "image/png"));
  if (!recortada) return null;
  return new File([recortada], `${base}.png`, { type: "image/png" });
}
