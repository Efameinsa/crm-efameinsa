"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Paperclip, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { agregarAdjuntosInforme, quitarAdjuntoInforme } from "@/lib/acciones/informes";
import {
  MAX_ADJUNTOS,
  MAX_BYTES,
  TIPOS_ADJUNTO,
  TIPOS_MIME_ACEPTADOS,
  etiquetaTipo,
  type AdjuntoCierre,
  type AdjuntoCierreFirmado,
  type AdjuntoNuevo,
  type TipoAdjunto,
} from "@/lib/adjuntos-cierre";
import { cn } from "@/lib/utils";

// El expediente del cierre: la orden de compra, el voucher, la cotización
// firmada. Brenda (C1) lo pidió el 28-08 y es, de todo lo que levantó, lo que
// más quiere: hoy esos papeles viven en su WhatsApp y Central se los pide por
// chat cada vez.
//
// CRITERIO: adjuntar tiene que costar DOS gestos —elegir de qué es, elegir el
// archivo— y ninguno más. Por eso no hay un formulario con un combo de tipo y
// un botón "subir": cada categoría ES el botón. Se pulsa "Voucher", se elige
// la foto, listo. Misma regla de adopción que el registro de gestión (≤15 s).

/** Un archivo elegido en el navegador que todavía no se subió. */
export interface AdjuntoPendiente {
  tipo: TipoAdjunto;
  archivo: File;
}

function recortar(nombre: string, largo = 26) {
  return nombre.length > largo ? nombre.slice(0, largo - 1) + "…" : nombre;
}

/**
 * La fila de categorías. Pulsar una abre el selector de archivos y todo lo que
 * se elija entra con esa categoría.
 */
export function PastillasAdjuntar({
  onArchivos,
  deshabilitado,
  etiqueta = "Adjuntar",
}: {
  onArchivos: (tipo: TipoAdjunto, archivos: File[]) => void;
  deshabilitado?: boolean;
  etiqueta?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const tipoElegido = useRef<TipoAdjunto>("voucher");

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Paperclip className="size-3" /> {etiqueta}
      </span>
      {TIPOS_ADJUNTO.map(([valor, texto]) => (
        <button
          key={valor}
          type="button"
          disabled={deshabilitado}
          onClick={() => {
            tipoElegido.current = valor;
            input.current?.click();
          }}
          className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          {texto}
        </button>
      ))}
      <input
        ref={input}
        type="file"
        multiple
        accept={TIPOS_MIME_ACEPTADOS}
        className="hidden"
        onChange={(e) => {
          const elegidos = Array.from(e.target.files ?? []);
          const grandes = elegidos.filter((f) => f.size > MAX_BYTES);
          if (grandes.length) {
            toast.error(`Máximo 10 MB por archivo: ${grandes.map((f) => f.name).join(", ")}`);
          }
          const buenos = elegidos.filter((f) => f.size <= MAX_BYTES);
          if (buenos.length) onArchivos(tipoElegido.current, buenos);
          // Sin esto, volver a elegir el MISMO archivo no dispara el change.
          e.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * Una pastilla de documento. Las fotos llevan su miniatura —para eso se pidió
 * adjuntar fotos: que se vean sin abrir nada—; el resto, un icono.
 */
export function ChipAdjunto({
  tipo,
  nombre,
  url,
  esImagen,
  onQuitar,
  pendiente,
}: {
  tipo: string;
  nombre: string;
  url?: string;
  esImagen?: boolean;
  onQuitar?: () => void;
  /** Elegido pero todavía no subido: se ve en gris y sin enlace. */
  pendiente?: boolean;
}) {
  const cuerpo = (
    <>
      {esImagen && url ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal, no optimizable
        <img src={url} alt="" className="size-5 flex-none rounded-full object-cover" />
      ) : (
        <span className="flex size-5 flex-none items-center justify-center rounded-full bg-background">
          <FileText className="size-3" />
        </span>
      )}
      <b className="font-semibold">{etiquetaTipo(tipo)}</b>
      <span className="text-muted-foreground">{recortar(nombre)}</span>
    </>
  );

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 text-[11px]",
        pendiente ? "border-dashed border-border bg-background" : "border-border bg-secondary",
        onQuitar ? "pr-1" : "pr-2.5",
      )}
    >
      {url && !pendiente ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          title={nombre}
          className="inline-flex items-center gap-1.5 hover:underline"
        >
          {cuerpo}
        </a>
      ) : (
        <span title={nombre} className="inline-flex items-center gap-1.5">
          {cuerpo}
        </span>
      )}
      {onQuitar && (
        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar ${nombre}`}
          className="cursor-pointer rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

/** Solo lectura: lo que ve Central en su cola y el comercial en la ficha. */
export function ChipsAdjuntos({ adjuntos }: { adjuntos: AdjuntoCierreFirmado[] }) {
  if (adjuntos.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {adjuntos.map((a) => (
        <ChipAdjunto key={a.path} tipo={a.tipo} nombre={a.nombre} url={a.url} esImagen={a.esImagen} />
      ))}
    </div>
  );
}

/**
 * Sube los archivos al bucket privado y deja los metadatos en el informe. El
 * archivo va primero: si la subida falla no se guarda nada, porque un
 * metadato apuntando a un objeto que no existe es peor que no tener el
 * documento (misma decisión que en el registro de gestión).
 */
export async function subirArchivosCierre(
  informeId: string,
  pendientes: AdjuntoPendiente[],
): Promise<{ error: string | null; adjuntos?: AdjuntoCierre[] }> {
  const storage = createClient().storage.from("adjuntos");
  const metadatos: AdjuntoNuevo[] = [];

  for (const { tipo, archivo } of pendientes) {
    const limpio = archivo.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
    const path = `cierres/${informeId}/${crypto.randomUUID()}-${limpio}`;
    const tipoMime = archivo.type || "application/octet-stream";
    const { error } = await storage.upload(path, archivo, {
      contentType: tipoMime,
    });
    if (error) return { error: `No se pudo subir "${archivo.name}": ${error.message}` };
    metadatos.push({
      tipo,
      path,
      nombre: archivo.name.slice(0, 200),
      tipo_mime: tipoMime,
      tamano: archivo.size,
    });
  }

  return await agregarAdjuntosInforme(informeId, metadatos);
}

/**
 * El bloque completo para un informe que YA existe: la ficha del cliente y la
 * cola de Central. Sube en cuanto se elige el archivo.
 *
 * Sobre un informe emitido también se puede agregar —y es el caso importante:
 * con crédito a 30 días el voucher llega un mes después de que Central ya
 * facturó (migración 0099)—. Lo que no se puede es quitar.
 */
export function AdjuntosCierre({
  informeId,
  adjuntos,
  emitido,
  compacto,
}: {
  informeId: string;
  adjuntos: AdjuntoCierreFirmado[];
  emitido: boolean;
  /** En la cola de Central el espacio es una celda de tabla. */
  compacto?: boolean;
}) {
  const router = useRouter();
  const [ocupado, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const lleno = adjuntos.length >= MAX_ADJUNTOS;

  function adjuntar(tipo: TipoAdjunto, archivos: File[]) {
    startTransition(async () => {
      const r = await subirArchivosCierre(
        informeId,
        archivos.map((archivo) => ({ tipo, archivo })),
      );
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(archivos.length === 1 ? "Documento adjuntado" : `${archivos.length} documentos adjuntados`);
      setAbierto(false);
      router.refresh();
    });
  }

  function quitar(path: string, nombre: string) {
    if (!confirm(`¿Quitar "${nombre}" del expediente?`)) return;
    startTransition(async () => {
      const r = await quitarAdjuntoInforme(informeId, path);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  }

  return (
    <div className={cn("space-y-1.5", ocupado && "opacity-60")}>
      {adjuntos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {adjuntos.map((a) => (
            <ChipAdjunto
              key={a.path}
              tipo={a.tipo}
              nombre={a.nombre}
              url={a.url}
              esImagen={a.esImagen}
              // Un documento que Central ya vio no se retira (migración 0099).
              onQuitar={emitido ? undefined : () => quitar(a.path, a.nombre)}
            />
          ))}
        </div>
      )}

      {lleno ? (
        <p className="text-[11px] text-muted-foreground">Expediente completo ({MAX_ADJUNTOS} documentos).</p>
      ) : compacto && !abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          disabled={ocupado}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
        >
          <Paperclip className="size-3" />
          {adjuntos.length > 0 ? "Agregar" : "Adjuntar"}
        </button>
      ) : (
        <PastillasAdjuntar
          onArchivos={adjuntar}
          deshabilitado={ocupado}
          etiqueta={ocupado ? "Subiendo…" : "Adjuntar"}
        />
      )}
    </div>
  );
}
