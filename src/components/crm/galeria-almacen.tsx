import type { FotoAlmacen } from "@/lib/postventa";

const TITULO: Record<string, string> = {
  frente: "Frente",
  lateral_izq: "Lateral izquierdo",
  lateral_der: "Lateral derecho",
  posterior: "Posterior",
  arriba: "Arriba",
  video: "Video",
  guia: "Guía de remisión",
  maquina: "Máquina entregada",
  protocolo: "Protocolo de prueba",
};

/** Las fotos y el video que subió el almacén, con su etiqueta (0246). */
export function GaleriaAlmacen({ fotos, titulo = "Fotos del almacén" }: { fotos: (FotoAlmacen & { url: string | null })[]; titulo?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-[12px] font-bold uppercase tracking-wide text-foreground">{titulo}</h2>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {fotos.map((f, i) => (
          <a key={i} href={f.url ?? "#"} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-border">
            {f.url && f.tipo.startsWith("video") ? (
              <video src={f.url} controls className="aspect-square w-full object-cover" />
            ) : f.url && f.tipo.startsWith("image") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.url} alt={TITULO[f.etiqueta] ?? f.etiqueta} className="aspect-square w-full object-cover" />
            ) : (
              <span className="flex aspect-square items-center justify-center p-2 text-center text-[11px] text-muted-foreground">{f.nombre}</span>
            )}
            <span className="block px-1.5 py-1 text-[11px] font-medium text-foreground">{TITULO[f.etiqueta] ?? f.etiqueta}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
