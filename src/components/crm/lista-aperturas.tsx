import Link from "next/link";
import { PhoneForwarded } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  ETIQUETA_ESTADO_APERTURA,
  ETIQUETA_TIPO_APERTURA,
  aQuienLeToca,
  estadoApertura,
  type AperturaLlamada,
} from "@/lib/aperturas-llamada";
import { cn } from "@/lib/utils";

type Fila = AperturaLlamada & { cuentas: { razon_social: string } | null };

const diaLima = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const tituloDia = (dia: string, hoy: string, manana: string) => {
  const [y, m, d] = dia.split("-").map(Number);
  const texto = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("es-PE", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
  if (dia === hoy) return `Hoy · ${texto}`;
  if (dia === manana) return `Mañana · ${texto}`;
  if (dia < hoy) return `Atrasada · ${texto}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};
const horaLima = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "numeric", minute: "2-digit" });

/**
 * LAS APERTURAS, POR DÍA (0281). Lo abierto primero, agrupado por el día que
 * se le dio al cliente —Carlos, 23-09: «videollamadas agrupadas por fecha: 24,
 * 25, 26, solo las programadas»—; lo terminado de los últimos días, abajo.
 * La usan postventa y el almacén con la misma forma: cada fila dice a quién le
 * toca.
 */
export async function ListaAperturas({ vistaAlmacen = false }: { vistaAlmacen?: boolean }) {
  const supabase = await createClient();
  const hace30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("aperturas_llamada")
    .select("*, cuentas(razon_social)")
    .or(`anulada_at.is.null,anulada_at.gte.${hace30}`)
    .gte("solicitada_at", new Date(Date.now() - 120 * 86_400_000).toISOString())
    .order("programada_para", { ascending: true })
    .limit(500);
  const filas = (data ?? []) as unknown as Fila[];
  const abiertas = filas.filter((f) => aQuienLeToca(estadoApertura(f)) !== null);
  const cerradas = filas
    .filter((f) => aQuienLeToca(estadoApertura(f)) === null && (f.enviada_cliente_at ?? f.anulada_at ?? "") >= hace30)
    .reverse()
    .slice(0, 40);

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const manana = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const porDia = new Map<string, Fila[]>();
  for (const f of abiertas) {
    const d = diaLima(f.programada_para);
    porDia.set(d, [...(porDia.get(d) ?? []), f]);
  }

  if (filas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
        <PhoneForwarded className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-semibold text-foreground">Todavía no hay aperturas</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          {vistaAlmacen
            ? "Cuando postventa pida una videollamada o una atención, llega acá con el día, la hora y los equipos."
            : "Se envían desde el pedido (paso de preinstalación o puesta en marcha) o desde la ficha del cliente con «Enviar apertura». Antes iban por correo."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {abiertas.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Nada pendiente: todas las aperturas están cerradas.</p>
      ) : (
        [...porDia.entries()].map(([dia, lista]) => (
          <section key={dia} className="rounded-xl border border-border bg-card shadow-sm">
            <h2
              className={cn(
                "border-b border-border px-4 py-2.5 text-[13px] font-bold uppercase tracking-wide",
                dia < hoy ? "text-destructive" : "text-foreground",
              )}
            >
              {tituloDia(dia, hoy, manana)} <span className="font-medium text-muted-foreground">· {lista.length}</span>
            </h2>
            <ul className="divide-y divide-border">
              {lista.map((f) => (
                <Renglon key={f.id} f={f} vistaAlmacen={vistaAlmacen} />
              ))}
            </ul>
          </section>
        ))
      )}
      {cerradas.length > 0 && (
        <section className="rounded-xl border border-border bg-card">
          <h2 className="border-b border-border px-4 py-2.5 text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
            Cerradas en los últimos 30 días · {cerradas.length}
          </h2>
          <ul className="divide-y divide-border">
            {cerradas.map((f) => (
              <Renglon key={f.id} f={f} vistaAlmacen={vistaAlmacen} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Renglon({ f, vistaAlmacen }: { f: Fila; vistaAlmacen: boolean }) {
  const estado = estadoApertura(f);
  const leToca = aQuienLeToca(estado);
  const mia = (vistaAlmacen && leToca === "almacen") || (!vistaAlmacen && leToca === "postventa");
  return (
    <li>
      <Link href={`/aperturas/${f.id}`} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-2.5 transition-colors hover:bg-accent">
        <span className="w-16 shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-foreground">{horaLima(f.programada_para)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{f.cuentas?.razon_social ?? "Cliente"}</span>
          <span className="block text-xs text-muted-foreground">
            {ETIQUETA_TIPO_APERTURA[f.tipo]} · {f.equipos.split("\n")[0]}
            {f.tecnico ? ` · ${f.tecnico}` : ""}
          </span>
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
            estado === "anulada" && "bg-secondary text-muted-foreground",
            estado === "enviada_cliente" && "bg-[#E7F4EC] text-[#1E7F4F]",
            leToca && (mia ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"),
          )}
        >
          {ETIQUETA_ESTADO_APERTURA[estado]}
          {f.faltantes && estado === "informe_almacen" ? " · hay para cotizar" : ""}
        </span>
      </Link>
    </li>
  );
}
