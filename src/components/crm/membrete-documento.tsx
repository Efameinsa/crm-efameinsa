import { IDENTIDAD_SERIE } from "@/lib/pdf/series";

/** El granate de la marca (el del nombre de Open en la cabecera, reunión 28-09). */
const GRANATE = "#8B1510";

/**
 * EL MEMBRETE DE LOS DOCUMENTOS IMPRESOS (Santos, 24-09: «exacto como la
 * empresa: el logo del cierre, todo debe ser lo mismo»).
 *
 * La misma cabecera que lleva el cierre de venta: si el cierre es de Open
 * Investments, el pedido y el informe de soporte salen como Open; si es de
 * Efameinsa, con el isotipo de Efameinsa. Un solo sitio para las dos.
 *
 * REUNIÓN 28-09 14:18, mirando la hoja del informe de llamada: «Open
 * Investment SAC, que está en granate, que es el logo; en la parte de abajo
 * debe estar la parte en inglés (Laundry & Equipment). Y postventa a la
 * derecha… donde diga postventa, y el número». Y: «todos los registros
 * documentarios tienen que tener un código». Por eso a la izquierda va solo
 * la empresa y a la derecha el área y, si el documento lo tiene, su número.
 */
export function MembreteDocumento({
  serie,
  area,
  generado,
  numero,
}: {
  serie: "EFAMEINSA" | "OPEN" | null | undefined;
  area: string;
  generado?: string | null;
  /** El código del documento, tal como se lee: «Informe N.º 004-2026». */
  numero?: string | null;
}) {
  const clave = serie === "OPEN" ? "OPEN" : "EFAMEINSA";
  const id = IDENTIDAD_SERIE[clave];
  const acento = clave === "OPEN" ? GRANATE : id.acento;
  return (
    <div className="mb-3 flex items-center justify-between gap-4 border-b-2 pb-2" style={{ borderColor: acento }}>
      <div className="flex min-w-0 items-center gap-3">
        {id.usaLogo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-efameinsa.png" alt="Efameinsa" className="h-12 w-auto" />
            <div>
              <p className="text-[12px] font-semibold leading-tight">{id.nombreLegal}</p>
              <p className="text-[11px] text-neutral-600">{id.subtitulo}</p>
            </div>
          </>
        ) : (
          // Son empresas distintas (Santos, 24-09): en un documento de Open no
          // va nada de Efameinsa, ni la web.
          <div>
            <p className="text-xl font-black uppercase leading-tight tracking-wide" style={{ color: GRANATE }}>
              {id.nombreLegal}
            </p>
            <p className="text-[12px] font-semibold text-neutral-700">{id.subtitulo}</p>
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[13px] font-bold uppercase tracking-wide" style={{ color: acento }}>
          {area}
        </p>
        {numero && <p className="text-[13px] font-bold text-black">{numero}</p>}
        {(generado || clave === "EFAMEINSA") && (
          <p className="text-[11px] text-neutral-600">
            {generado ? `Generado el ${generado}` : null}
            {generado && clave === "EFAMEINSA" ? <br /> : null}
            {clave === "EFAMEINSA" ? "www.efameinsa.com" : null}
          </p>
        )}
      </div>
    </div>
  );
}
