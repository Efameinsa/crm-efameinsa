import type { Liquidacion } from "@/lib/liquidacion-automatica";
import { cn } from "@/lib/utils";

/**
 * LA LIQUIDACIÓN EN PANTALLA (0534; Santos 17-10: «renueva sus vistas con una
 * buena ui/ux para que le resulte intuitivo»). Es la misma hoja que el PDF
 * (lib/pdf/liquidacion-pdf.tsx), dibujada en HTML para que Finanzas vea en
 * vivo cómo queda mientras ajusta los campos: lo que cambia a la izquierda se
 * ve acá al instante, sin abrir ningún archivo.
 */

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];
const fechaCarta = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return `Lima, ${String(d).padStart(2, "0")} de ${MESES[m - 1] ?? ""} del ${a}`;
};
const fechaBarra = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function HojaLiquidacion({ l, className }: { l: Liquidacion; className?: string }) {
  const b = l.base;
  const esOpen = b.empresa === "OPEN";
  const simbolo = b.moneda === "PEN" ? "S/" : "$";
  const m = (n: number) => `${n < 0 ? "-" : ""}${simbolo}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const cifra = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className={cn("bg-white px-8 py-7 font-sans text-[10.5px] leading-[1.25] text-black shadow-sm ring-1 ring-border", className)}>
      {/* Membrete chico, como la plantilla. */}
      <div className="relative mb-4">
        {esOpen ? (
          <>
            <p className="text-[12px] font-bold text-[#C0272D]">OPEN INVESTMENTS S.A.C</p>
            <p className="-mt-0.5 text-[8px] text-neutral-600">Laundry &amp; Equipment</p>
            <div className="-mt-1 ml-[70px] w-[320px] border-b border-neutral-600" />
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/logo-efameinsa.png" alt="EFAMEINSA" className="h-7 w-auto" />
        )}
        <p className="absolute right-0 top-0 text-[9px] text-neutral-500">Liquidación N.º {l.numero}</p>
      </div>

      <p className="font-bold">{fechaCarta(l.fecha)}</p>
      <p>Sres.:</p>
      <p className="text-[11px] font-bold">{b.cliente}</p>
      {b.clienteDoc && <p className="text-[11px] font-bold">{b.clienteDoc.length === 8 ? "DNI" : "RUC"}: {b.clienteDoc}</p>}
      <p className="mt-3 underline">Presente.-</p>
      <p className="mt-2">
        Por medio de la presente; estamos enviando la siguiente liquidación: <b>{b.pedido}</b>
      </p>

      <table className="mt-3 w-full border-collapse border-[1.5px] border-black">
        <thead>
          <tr className="border-b-[1.5px] border-black text-left text-[10px] font-bold">
            <th className="w-12 border-r-[1.5px] border-black px-1 py-0.5 text-center">CANT</th>
            <th className="border-r-[1.5px] border-black px-1 py-0.5">{b.esServicio ? "DESCRIPCION" : "DETALLE DE EQUIPO"}</th>
            <th className="w-24 border-r-[1.5px] border-black px-1 py-0.5">PRECIO UNIT.</th>
            <th className="w-24 px-1 py-0.5 text-center">IMPORTE {simbolo}</th>
          </tr>
        </thead>
        <tbody>
          {b.renglones.map((r, i) => {
            const [cabeza, ...resto] = r.descripcion.split("\n");
            return (
              <tr key={i} className="align-top">
                <td className="border-r-[1.5px] border-black px-1 pt-2 text-center">{r.cantidad}</td>
                <td className="border-r-[1.5px] border-black px-1 pb-1.5 pt-2">
                  <p className="font-bold">{cabeza}</p>
                  {resto.filter((t) => t.trim()).map((t, k) => (
                    <p key={k}>{t}</p>
                  ))}
                  {r.series.map((s) => (
                    <p key={s}>SERIE: {s}</p>
                  ))}
                </td>
                <td className="border-r-[1.5px] border-black px-1 pt-2">
                  <span className="flex justify-between"><span>{simbolo}</span><span>{cifra(r.precioUnitario)}</span></span>
                </td>
                <td className="px-1 pt-2">
                  <span className="flex justify-between"><span>{simbolo}</span><span>{cifra(r.importe)}</span></span>
                </td>
              </tr>
            );
          })}
          {b.series.length > 0 && (
            <tr>
              <td className="border-r-[1.5px] border-black" />
              <td className="border-r-[1.5px] border-black px-1">{b.series.map((s) => <p key={s}>{s}</p>)}</td>
              <td className="border-r-[1.5px] border-black" />
              <td />
            </tr>
          )}
          <tr className="h-3.5">
            <td className="border-r-[1.5px] border-black" /><td className="border-r-[1.5px] border-black" /><td className="border-r-[1.5px] border-black" /><td />
          </tr>
        </tbody>
      </table>

      <div className="mt-0.5 space-y-px">
        <Caja rotulo="SUB TOTAL" monto={m(b.subtotal)} />
        <Caja rotulo="IGV 18%" monto={m(b.igv)} />
        <Caja rotulo="TOTAL" monto={m(b.total)} sombra />
      </div>

      <div className="mt-1 flex gap-3">
        <div className={l.comisiones.length > 0 || l.notaLibre ? "w-44 shrink-0" : "hidden"}>
          {l.comisiones.length > 0 && (
            <div className="mt-2">
              <p className="font-bold">COMISIONES</p>
              {l.comisiones.map((x, i) => (
                <p key={i} className="flex justify-between text-[9px]"><span>{x.izquierda}</span><span>{m(x.monto)}</span></p>
              ))}
              <p className="border-t border-black text-right text-[9px] font-bold">{m(l.comisiones.reduce((s, x) => s + x.monto, 0))}</p>
            </div>
          )}
          {l.notaLibre && (
            <div className="mt-2">
              <p className="font-bold">NOTA</p>
              <p className="text-[9px] font-bold">{l.notaLibre}</p>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          {l.bloques.map((x, i) => (
            <div key={i} className="space-y-px pt-1.5">
              {x.filas.map((f, k) => (
                <Caja key={k} izquierda={f.izquierda} rotulo={f.concepto} monto={f.monto == null ? "" : m(f.monto)} rojo={f.monto != null && f.monto < 0} />
              ))}
              <Caja rotulo="TOTAL SALDO" monto={m(x.saldo)} sombra />
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 w-[380px] max-w-full border-[1.5px] border-black py-1 text-center text-[10.5px] font-bold">{l.rotulo}</p>

      <p className="mt-3 font-bold underline">NOTA:</p>
      {l.notas.map((n, i) => (
        <p key={i} className={cn(i === 0 && "font-bold")}>- {n}</p>
      ))}

      {l.letras.length > 0 && (
        <table className="mt-3 w-full border-collapse text-[8.5px]">
          <thead>
            <tr className="bg-[#D9D9D9] font-bold">
              {["N°", "N° LETRA", "GIRO", "VCTO", "MONTO", "DIAS", "INTERESES", "IMPORT LETRA + INTE", "ABONADO", "ESTADO", "FECHA"].map((t) => (
                <th key={t} className="border border-black px-1 text-left">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {l.letras.map((x) => (
              <tr key={x.n}>
                {[String(x.n), "", fechaBarra(x.giro), fechaBarra(x.vence), m(x.monto), String(x.dias), cifra(x.interes), m(x.monto + x.interes), "", "PENDIENTE", ""].map((t, i) => (
                  <td key={i} className={cn("border border-black px-1", i >= 4 && i <= 8 && "text-right")}>{t}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-5 flex items-center justify-center gap-3">
        {esOpen ? (
          <div>
            <p className="text-[17px] font-bold leading-tight text-[#C0272D]">OPEN INVESTMENTS S.A.C</p>
            <p className="text-[10px] text-neutral-600">Laundry &amp; Equipment</p>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/logo-efameinsa.png" alt="EFAMEINSA" className="h-8 w-auto" />
        )}
        {b.firma && (
          <div className="border-l border-neutral-500 pl-2 text-[9px] leading-snug">
            <p>{b.firma.nombre}</p>
            <p className="font-bold">CONTABILIDAD Y FINANZAS</p>
            {b.firma.celular && <p>Celular : {b.firma.celular}</p>}
            {b.firma.correo && <p>Email : <span className="text-[#0563C1] underline">{b.firma.correo}</span></p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Caja({ izquierda, rotulo, monto, sombra, rojo }: { izquierda?: string; rotulo: string; monto: string; sombra?: boolean; rojo?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="min-w-0 flex-1 break-words text-right text-[10px] font-bold leading-tight">{izquierda ?? ""}</span>
      <span className={cn("w-24 border border-black px-1 text-[10px] font-bold leading-4", sombra && "bg-[#A6A6A6]")}>{rotulo}</span>
      <span className={cn("w-24 border border-black px-1 text-right text-[10px] font-bold leading-4", sombra && "bg-[#A6A6A6]", rojo && "text-[#C00000]")}>{monto}</span>
    </div>
  );
}
