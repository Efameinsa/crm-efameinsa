import { usd, type KpisGerencia, type PuntoMensual } from "@/lib/reportes";
import type { BarraDato } from "@/components/crm/grafico-barras";

// Desglose de ventas por razón social (pedido de Carlos 19-08: la cobranza y
// la proyección de importaciones —99,9 % entran por Open— se manejan por
// empresa). Sirve además de leyenda de colores de las barras apiladas.
export function LeyendaSerie({ k }: { k: KpisGerencia }) {
  const s = k.ventas_serie;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-2.5 rounded-sm bg-primary/85" />
        Efameinsa: <b className="text-foreground">{usd(s.efameinsa_usd)}</b> · {s.n_efameinsa}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-2.5 rounded-sm bg-[#2C2E35]/80" />
        Open Investments: <b className="text-foreground">{usd(s.open_usd)}</b> · {s.n_open}
      </span>
      {s.n_sin_serie > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-muted-foreground/30" />
          Sin empresa (histórico Excel): <b className="text-foreground">{usd(s.sin_serie_usd)}</b> · {s.n_sin_serie}
        </span>
      )}
      <span className="text-[10px]">— desglose del período filtrado; la empresa se registra al cotizar</span>
    </p>
  );
}

/** Un punto de la serie mensual → dato del gráfico con barras apiladas por empresa. */
export function barraMensualPorSerie(p: PuntoMensual): BarraDato {
  return {
    clave: p.mes,
    etiqueta: new Date(`${p.mes}-01T12:00:00`).toLocaleDateString("es-PE", { month: "short", year: "2-digit" }),
    valor: p.ventas_usd,
    valorTexto: p.ventas_usd >= 1000 ? `${Math.round(p.ventas_usd / 1000)}k` : String(Math.round(p.ventas_usd)),
    detalle: `${p.mes}: ${usd(p.ventas_usd)} en ${p.n_ventas} venta${p.n_ventas === 1 ? "" : "s"} — Efameinsa ${usd(p.efameinsa_usd)} · Open ${usd(p.open_usd)}${p.sin_serie_usd > 0 ? ` · sin empresa ${usd(p.sin_serie_usd)}` : ""}`,
    segmentos: [
      { etiqueta: "Efameinsa", valor: p.efameinsa_usd, clase: "bg-primary/85" },
      { etiqueta: "Open Investments", valor: p.open_usd, clase: "bg-[#2C2E35]/80" },
      { etiqueta: "Sin empresa (histórico)", valor: p.sin_serie_usd, clase: "bg-muted-foreground/30" },
    ],
  };
}
