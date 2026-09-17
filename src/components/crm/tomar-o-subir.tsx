"use client";

import { useSyncExternalStore } from "react";
import { Camera, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Una foto entra de dos maneras y hay que ofrecer las dos (Santos, 17-09):
 * «Tomar foto» abre la cámara directo —solo en celular o tablet, que es donde
 * hay cámara— y «Subir» abre la galería o los archivos, para la foto que ya se
 * tomó o el PDF del protocolo. En computadora queda un solo botón.
 *
 * El `capture` del input es lo que decide si el celular abre la cámara o la
 * galería; por eso son dos inputs y no uno.
 */
/**
 * ¿Hay cámara que valga la pena abrir? Celular o tablet: pantalla táctil de
 * tamaño de mano. En una laptop con cámara «tomar foto» abriría la webcam, que
 * no es lo que nadie quiere. Se lee como sistema externo (igual que
 * modo-aplicacion.ts): el servidor responde «no» y el cliente corrige sin
 * desincronizar la hidratación.
 */
const CONSULTA_TACTIL = "(pointer: coarse)";
function suscribirCamara(alCambiar: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const consulta = window.matchMedia(CONSULTA_TACTIL);
  consulta.addEventListener("change", alCambiar);
  window.addEventListener("resize", alCambiar);
  return () => {
    consulta.removeEventListener("change", alCambiar);
    window.removeEventListener("resize", alCambiar);
  };
}
function hayCamara(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.(CONSULTA_TACTIL).matches === true && window.innerWidth < 1100;
}
export function useConCamara(): boolean {
  return useSyncExternalStore(suscribirCamara, hayCamara, () => false);
}

export function TomarOSubir({
  titulo,
  archivo,
  onChange,
  acepta = "image/*",
  video = false,
  compacto = false,
}: {
  titulo: string;
  archivo: File | null;
  onChange: (f: File | null) => void;
  acepta?: string;
  /** Grabar en vez de fotografiar. */
  video?: boolean;
  compacto?: boolean;
}) {
  const conCamara = useConCamara();
  const acepto = video ? "video/*" : acepta;
  return (
    <div className={cn("rounded-md border px-2.5 py-2 text-xs", archivo ? "border-[#1E7F4F]/50 bg-[#1E7F4F]/5" : "border-dashed border-border")}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block font-medium">{titulo}</span>
          <span className="line-clamp-1 break-words text-[11px] text-muted-foreground">{archivo?.name ?? (video ? "Sin video" : "Sin foto")}</span>
        </span>
        {archivo && (
          <button type="button" onClick={() => onChange(null)} className="text-muted-foreground hover:text-destructive" aria-label={`Quitar ${archivo.name}`}>
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className={cn("mt-1.5 flex gap-1.5", compacto && "flex-wrap")}>
        {conCamara && (
          <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90">
            <Camera className="size-3.5" /> {video ? "Grabar" : "Tomar foto"}
            <input type="file" accept={acepto} capture="environment" className="hidden" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
          </label>
        )}
        <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-accent">
          <Upload className="size-3.5" /> {conCamara ? "Subir" : video ? "Subir video" : acepta.includes("pdf") ? "Subir foto o PDF" : "Subir foto"}
          <input type="file" accept={acepto} className="hidden" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
        </label>
      </div>
    </div>
  );
}

/**
 * Varias fotos a la vez (informe técnico, caso, protocolo): la cámara suma de
 * a una; la galería deja elegir varias.
 */
export function TomarOSubirVarias({
  titulo,
  archivos,
  onChange,
  acepta = "image/*",
  maximo = 10,
}: {
  titulo: string;
  archivos: File[];
  onChange: (f: File[]) => void;
  acepta?: string;
  maximo?: number;
}) {
  const conCamara = useConCamara();
  const agregar = (lista: FileList | null) => onChange([...archivos, ...Array.from(lista ?? [])].slice(0, maximo));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{titulo}</span>
        {conCamara && (
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Camera className="size-3.5" /> Tomar foto
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { agregar(e.target.files); e.target.value = ""; }} />
          </label>
        )}
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent">
          <Upload className="size-3.5" /> {acepta.includes("pdf") ? "Subir fotos o PDF" : "Subir fotos"}
          <input type="file" accept={acepta} multiple className="hidden" onChange={(e) => { agregar(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
      {archivos.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {archivos.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-foreground">
              {f.name.length > 24 ? f.name.slice(0, 21) + "…" : f.name}
              <button type="button" onClick={() => onChange(archivos.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive" aria-label={`Quitar ${f.name}`}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
