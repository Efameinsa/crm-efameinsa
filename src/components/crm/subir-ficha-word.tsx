"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { EQUIPO_NUEVO, type EquipoEditable } from "@/components/crm/ficha-tecnica-editor";
import { leerFichaDeWord } from "@/lib/leer-ficha-word";
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
 * que parece y la que decide es ella. Si se equivocó de archivo, la hoja dice
 * de cuál salió y se puede cambiar ahí mismo o cancelar.
 */
export function SubirFichaWord({ onLeida }: { onLeida: (equipo: EquipoEditable) => void }) {
  const [leyendo, setLeyendo] = useState(false);
  const [encima, setEncima] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  async function leer(archivo: File) {
    setLeyendo(true);
    try {
      const { equipo, bloques, fotoIlegible } = await leerFichaDeWord(archivo);
      if (fotoIlegible) toast.warning("La ficha trae una imagen que el navegador no sabe abrir. Todo lo demás sí se leyó.");
      onLeida({ ...EQUIPO_NUEVO, ...equipo });
      toast.success(`${equipo.leidaDe}: ${bloques} líneas de descripción${equipo.fotoLista ? " y su foto" : ""}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
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
