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
  en_local: "En el local del cliente",
  recibe: "Quien recibe",
  protocolo: "Protocolo de prueba",
};

type FotoConUrl = FotoAlmacen & { url: string | null };

/**
 * Las fotos y el video que subió el almacén, con su etiqueta (0246). Las de
 * la salida subidas por máquina van juntas bajo su serie (Lesly, 10-10).
 */
export function GaleriaAlmacen({ fotos, titulo = "Fotos del almacén" }: { fotos: FotoConUrl[]; titulo?: string }) {
  const grupos: { maquina: string | null; serie: string | null; fotos: FotoConUrl[] }[] = [];
  for (const f of fotos) {
    const maquina = f.maquina ?? null;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.maquina === maquina && ultimo.serie === (f.serie ?? null)) ultimo.fotos.push(f);
    else grupos.push({ maquina, serie: f.serie ?? null, fotos: [f] });
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-[12px] font-bold uppercase tracking-wide text-foreground">{titulo}</h2>
      {grupos.map((g, j) => (
        <div key={j}>
          {g.maquina && (
            <p className="mt-3 text-[11px] font-semibold text-foreground">
              {g.maquina}
              <span className="ml-1 font-mono font-medium text-muted-foreground">{g.serie ? `· Serie ${g.serie}` : "· sin serie"}</span>
            </p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            {g.fotos.map((f, i) => (
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
      ))}
    </div>
  );
}
