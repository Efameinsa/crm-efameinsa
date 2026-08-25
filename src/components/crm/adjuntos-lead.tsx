import { Paperclip } from "lucide-react";
import type { AdjuntoLeadFirmado } from "@/lib/adjuntos-lead";

// La foto o el PDF que el prospecto mandó por WhatsApp, adjuntados por Central
// al registrar (25-08). Las imágenes se ven en miniatura —para eso se pidió:
// que el comercial VEA la foto del equipo sin abrir nada—; el resto (PDF,
// Word, Excel) va como enlace. Todo abre en pestaña nueva con URL firmada.
export function AdjuntosLead({ adjuntos }: { adjuntos: AdjuntoLeadFirmado[] }) {
  if (adjuntos.length === 0) return null;
  const imagenes = adjuntos.filter((a) => a.esImagen);
  const documentos = adjuntos.filter((a) => !a.esImagen);
  return (
    <div className="mt-2 space-y-1.5">
      {imagenes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {imagenes.map((a, i) => (
            <a key={i} href={a.url} target="_blank" rel="noreferrer" title={a.nombre}>
              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal, no optimizable */}
              <img
                src={a.url}
                alt={a.nombre}
                className="h-20 w-20 rounded-md border border-border object-cover"
              />
            </a>
          ))}
        </div>
      )}
      {documentos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {documentos.map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] text-foreground hover:bg-accent"
            >
              <Paperclip className="size-3" />
              {a.nombre.length > 32 ? a.nombre.slice(0, 29) + "…" : a.nombre}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
