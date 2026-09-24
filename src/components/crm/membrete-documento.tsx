import { IDENTIDAD_SERIE } from "@/lib/pdf/series";

/**
 * EL MEMBRETE DE LOS DOCUMENTOS IMPRESOS (Santos, 24-09: «exacto como la
 * empresa: el logo del cierre, todo debe ser lo mismo»).
 *
 * La misma cabecera que lleva el cierre de venta: si el cierre es de Open
 * Investments, el pedido y el informe de soporte salen como Open; si es de
 * Efameinsa, con el isotipo de Efameinsa. Un solo sitio para las dos.
 */
export function MembreteDocumento({ serie, area, derecha }: { serie: "EFAMEINSA" | "OPEN" | null | undefined; area: string; derecha?: React.ReactNode }) {
  const clave = serie === "OPEN" ? "OPEN" : "EFAMEINSA";
  const id = IDENTIDAD_SERIE[clave];
  return (
    <div className="mb-3 flex items-center justify-between gap-4 border-b-2 pb-2" style={{ borderColor: id.acento }}>
      <div className="flex items-center gap-3">
        {id.usaLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/logo-efameinsa.png" alt="Efameinsa" className="h-12 w-auto" />
        ) : (
          <p className="text-xl font-black uppercase tracking-wide" style={{ color: id.acento }}>
            Open Investments
          </p>
        )}
        <div>
          <p className="text-[12px] font-semibold leading-tight">{id.nombreLegal}</p>
          <p className="text-[11px] text-neutral-600">
            {id.subtitulo} · {area}
          </p>
        </div>
      </div>
      <div className="text-right text-[11px] text-neutral-600">{derecha}</div>
    </div>
  );
}
