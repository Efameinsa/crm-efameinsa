"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Paperclip, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AdjuntoLead } from "@/lib/validaciones/lead";
import { cn } from "@/lib/utils";

// La foto o el PDF que el prospecto mandó por WhatsApp. Nació en la captura de
// Central (pedido del 25-08) y el 01-09 lo pidieron también las comerciales
// para su «Pasar contacto a Central»: es el mismo caso —el cliente les manda
// la foto de la placa o del equipo por WhatsApp— y hasta ahora lo describían
// con palabras. Vive acá una sola vez: los dos formularios suben al mismo
// bucket con las mismas reglas, y lo adjuntado se ve igual en la bandeja de
// Central y en la ficha del comercial (AdjuntosLead).

// Lo que acepta el bucket 'adjuntos' (0029). Los .doc viejos llegan a veces
// con file.type vacío — se resuelve por extensión para no subirlos como
// octet-stream, que el bucket rechaza.
const MIME_POR_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const MAX_ADJUNTOS = 5;
export const MAX_TAMANO = 10 * 1024 * 1024; // límite del bucket
export const ACEPTA_ADJUNTOS = ".pdf,.doc,.docx,.xls,.xlsx,image/jpeg,image/png,image/webp";

function tipoDeArchivo(f: File): string | null {
  if (f.type && Object.values(MIME_POR_EXTENSION).includes(f.type)) return f.type;
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_POR_EXTENSION[ext] ?? null;
}

function pesoLegible(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

interface ArchivoElegido {
  file: File;
  /** Nombre que verá quien lo reciba (las capturas pegadas llegan como "image.png"). */
  nombre: string;
  tipo: string;
  /** Object URL para la miniatura; solo imágenes. */
  vistaPrevia: string | null;
}

export type ControlAdjuntos = ReturnType<typeof useAdjuntos>;

/**
 * El estado de los archivos elegidos y su subida al bucket privado.
 *
 * Se suben ANTES de registrar el contacto: si una subida falla se avisa y NO
 * se registra — mejor reintentar que dejar el contacto registrado sin la foto
 * que el cliente mandó.
 */
export function useAdjuntos() {
  const [archivos, setArchivos] = useState<ArchivoElegido[]>([]);
  const [progreso, setProgreso] = useState<{ hecho: number; total: number } | null>(null);

  // Las miniaturas son object URLs: se liberan al desmontar. El ref evita
  // volver a suscribir el efecto en cada cambio de la lista.
  const vivos = useRef<ArchivoElegido[]>([]);
  useEffect(() => {
    vivos.current = archivos;
  }, [archivos]);
  useEffect(
    () => () => {
      for (const a of vivos.current) if (a.vistaPrevia) URL.revokeObjectURL(a.vistaPrevia);
    },
    [],
  );

  const agregarArchivos = useCallback((nuevos: File[], desdePortapapeles = false) => {
    setArchivos((prev) => {
      const lista = [...prev];
      for (const f of nuevos) {
        if (lista.length >= MAX_ADJUNTOS) {
          toast.error(`Máximo ${MAX_ADJUNTOS} archivos por contacto`);
          break;
        }
        const tipo = tipoDeArchivo(f);
        if (!tipo) {
          toast.error(`"${f.name}": solo se aceptan fotos, PDF, Word o Excel`);
          continue;
        }
        if (f.size > MAX_TAMANO) {
          toast.error(`"${f.name}" pasa de 10 MB`);
          continue;
        }
        const esImagen = tipo.startsWith("image/");
        // Las capturas pegadas llegan todas como "image.png": se les pone un
        // nombre que diga algo en la ficha de quien lo reciba.
        const nombre =
          desdePortapapeles && /^image\.\w+$/i.test(f.name)
            ? `captura-pegada-${lista.length + 1}.${f.name.split(".").pop()}`
            : f.name;
        lista.push({ file: f, nombre, tipo, vistaPrevia: esImagen ? URL.createObjectURL(f) : null });
      }
      return lista;
    });
  }, []);

  const quitarArchivo = useCallback((i: number) => {
    setArchivos((prev) => {
      const quitado = prev[i];
      if (quitado?.vistaPrevia) URL.revokeObjectURL(quitado.vistaPrevia);
      return prev.filter((_, j) => j !== i);
    });
  }, []);

  const limpiar = useCallback(() => {
    setArchivos((prev) => {
      for (const a of prev) if (a.vistaPrevia) URL.revokeObjectURL(a.vistaPrevia);
      return [];
    });
    setProgreso(null);
  }, []);

  // Pegar (Ctrl+V) una captura de WhatsApp en cualquier parte del formulario
  // la adjunta — es el caso que originó el pedido: el prospecto manda la foto
  // del equipo por WhatsApp y del otro lado se le hace captura de pantalla.
  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length === 0) return; // texto pegado: que siga su curso normal
      e.preventDefault();
      agregarArchivos(files, true);
    },
    [agregarArchivos],
  );

  async function subir(): Promise<
    { adjuntos: AdjuntoLead[]; error: null } | { adjuntos: null; error: string }
  > {
    if (archivos.length === 0) return { adjuntos: [], error: null };
    const storage = createClient().storage.from("adjuntos");
    const subidos: AdjuntoLead[] = [];
    setProgreso({ hecho: 0, total: archivos.length });
    for (const a of archivos) {
      const path = `leads/${crypto.randomUUID()}-${a.nombre.replace(/[^\w.\-]+/g, "_").slice(0, 80)}`;
      const { error } = await storage.upload(path, a.file, { contentType: a.tipo });
      if (error) {
        setProgreso(null);
        return { adjuntos: null, error: `No se pudo subir "${a.nombre}": ${error.message}` };
      }
      subidos.push({ path, nombre: a.nombre, tipo: a.tipo, tamano: a.file.size });
      setProgreso((p) => (p ? { ...p, hecho: p.hecho + 1 } : p));
    }
    setProgreso(null);
    return { adjuntos: subidos, error: null };
  }

  return { archivos, progreso, agregarArchivos, quitarArchivo, limpiar, onPaste, subir };
}

/**
 * La zona para adjuntar: elegir archivo, arrastrarlo, o pegar con Ctrl+V una
 * captura de pantalla — este último es el caso real de todos los días.
 *
 * El Ctrl+V lo escucha el formulario entero (`ctl.onPaste`), no esta caja: al
 * pegar, quien está escribiendo tiene el cursor en un campo, no acá.
 */
export function CampoAdjuntos({
  ctl,
  ayuda,
  className,
}: {
  ctl: ControlAdjuntos;
  ayuda?: string;
  className?: string;
}) {
  const [arrastrando, setArrastrando] = useState(false);
  const lleno = ctl.archivos.length >= MAX_ADJUNTOS;

  return (
    <div className={cn("space-y-2", className)}>
      <label
        className={cn(
          "flex flex-col items-center gap-1 rounded-lg border border-dashed p-4 text-center transition-colors",
          lleno ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          arrastrando
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-accent/50",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          ctl.agregarArchivos(Array.from(e.dataTransfer?.files ?? []));
        }}
      >
        <ImagePlus className={cn("size-5", arrastrando ? "text-primary" : "text-muted-foreground")} />
        <span className="text-sm text-foreground">
          {arrastrando ? (
            "Suelte acá el archivo"
          ) : (
            <>
              Haga clic para elegir, arrastre el archivo, o péguelo con{" "}
              <kbd className="rounded border border-border bg-secondary px-1 py-0.5 font-sans text-[11px] font-semibold">
                Ctrl+V
              </kbd>
            </>
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {ayuda ?? `Fotos, PDF, Word o Excel · hasta ${MAX_ADJUNTOS} archivos de 10 MB`}
        </span>
        <input
          type="file"
          multiple
          disabled={lleno}
          accept={ACEPTA_ADJUNTOS}
          className="hidden"
          onChange={(e) => {
            ctl.agregarArchivos(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </label>

      {ctl.archivos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ctl.archivos.map((a, i) =>
            a.vistaPrevia ? (
              <span key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local */}
                <img
                  src={a.vistaPrevia}
                  alt={a.nombre}
                  title={`${a.nombre} · ${pesoLegible(a.file.size)}`}
                  className="h-20 w-20 rounded-md border border-border object-cover"
                />
                <button
                  type="button"
                  onClick={() => ctl.quitarArchivo(i)}
                  aria-label={`Quitar ${a.nombre}`}
                  className="absolute -right-1.5 -top-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full border border-border bg-background shadow-sm hover:bg-accent"
                >
                  <X className="size-3" />
                </button>
              </span>
            ) : (
              <span
                key={i}
                title={`${a.nombre} · ${pesoLegible(a.file.size)}`}
                className="inline-flex h-fit items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] text-foreground"
              >
                <Paperclip className="size-3" />
                {a.nombre.length > 28 ? a.nombre.slice(0, 25) + "…" : a.nombre}
                <button
                  type="button"
                  onClick={() => ctl.quitarArchivo(i)}
                  aria-label={`Quitar ${a.nombre}`}
                  className="cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
