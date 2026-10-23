"use client";

// EL STOCK DEL ALMACÉN (Santos y Lesly, 23-10 18:25): «ya no vamos a trabajar desde el
// Excel… la Central me solicita el código y yo debería tener como una columna para dar
// check: si le doy check a esa serie, automáticamente le estoy respondiendo a la Central,
// y debe descontarse de mi stock». Dos piezas para la cuenta del almacén:
//   · «Central pide la serie»: cada máquina de un pedido que espera serie, con las
//     máquinas del stock que le sirven; un check y la serie queda en el pedido, la
//     máquina reservada (sale del disponible) y la Central avisada.
//   · «Agregar al stock»: lo que llega a planta entra acá, sin Excel.

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, PackagePlus, Search } from "lucide-react";
import { registrarSerieDelEquipo } from "@/lib/acciones/postventa";
import { cargarSeries } from "@/lib/acciones/inventario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface MaquinaQueEsperaSerie {
  itemId: string;
  servicioId: string;
  cliente: string;
  pedido: string | null;
  pedidoDesde: string | null;
  descripcion: string;
  sku: string | null;
  porImportar: boolean;
}

export interface MaquinaDisponible {
  id: string;
  serie: string;
  codigo: string | null;
  marca: string | null;
  modelo: string;
  descripcion: string;
  ubicacion: string | null;
  empresa: string | null;
  ingreso: string;
}

export interface CodigoParaAgregar {
  id: string;
  sku: string;
  nombre: string;
  modelo: string | null;
}

const norm = (t: string) => t.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** La palabra del modelo que sale en la descripción del pedido (RX350, UT075, TITAN…). */
function modeloDe(texto: string): string | null {
  return (
    texto.match(/MODELO?\s*[:.]?\s*([A-Z0-9][A-Z0-9/.\-]{2,14})/i)?.[1] ??
    texto.match(/\b(RX|FX|UCT|UCG|UWT|UW|UT|UY|SS|WET|GIANT|TITAN|FCU|DX|NDE|G\d{2}|E2|HM)[\w./-]*/i)?.[0] ??
    null
  );
}

/** Las máquinas del stock que le sirven a una línea del pedido: mismo código, o el modelo en la descripción. */
function compatibles(m: MaquinaQueEsperaSerie, stock: MaquinaDisponible[]): MaquinaDisponible[] {
  if (m.sku) {
    const mismas = stock.filter((d) => d.codigo?.toUpperCase() === m.sku!.toUpperCase());
    if (mismas.length) return mismas;
  }
  const mod = modeloDe(m.descripcion);
  if (!mod) return [];
  const clave = norm(mod).replace(/[^A-Z0-9]/g, "");
  return stock.filter((d) => norm(`${d.modelo} ${d.descripcion} ${d.codigo ?? ""}`).replace(/[^A-Z0-9 ]/g, "").replace(/ /g, "").includes(clave));
}

export function CentralPideSerie({ esperan, stock }: { esperan: MaquinaQueEsperaSerie[]; stock: MaquinaDisponible[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [usadas, setUsadas] = useState<Set<string>>(new Set());
  const [buscar, setBuscar] = useState<Record<string, string>>({});

  if (esperan.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ningún pedido espera serie. Cuando Central pida el código de un pedido, sus máquinas aparecen acá con las del stock que le sirven.
      </p>
    );
  }
  const libres = stock.filter((d) => !usadas.has(d.id));

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Elija la máquina que sale: un check y la serie queda en el pedido, la máquina se reserva (deja de estar disponible) y Central recibe el aviso.
      </p>
      {esperan.map((m) => {
        const q = buscar[m.itemId] ?? "";
        const tokens = norm(q).split(/\s+/).filter(Boolean);
        const lista = tokens.length
          ? libres.filter((d) => tokens.every((t) => norm(`${d.codigo ?? ""} ${d.marca ?? ""} ${d.modelo} ${d.descripcion} ${d.serie}`).includes(t)))
          : compatibles(m, libres);
        return (
          <div key={m.itemId} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{m.cliente}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground" title={m.descripcion}>
                  {m.sku && <span className="mr-1 font-mono font-medium text-foreground">{m.sku}</span>}
                  {m.descripcion}
                </p>
                {m.porImportar && <p className="mt-0.5 text-[11px] font-medium text-amber-700">Marcada por importar: si ya llegó, elija su serie.</p>}
              </div>
              <Link href={`/almacen/pedidos/${m.servicioId}`} prefetch={false} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                {m.pedido ?? "Ver el pedido"} <ExternalLink className="size-3" />
              </Link>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setBuscar((b) => ({ ...b, [m.itemId]: e.target.value }))}
                placeholder="¿No está abajo? Busque por código, modelo o serie"
                className="h-8 text-xs"
              />
            </div>
            {lista.length === 0 ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                No hay máquinas disponibles de este modelo en el stock. Si llegó, agréguela en «Agregar al stock» y vuelva acá.
              </p>
            ) : (
              <ul className="mt-2 max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
                {lista.slice(0, 30).map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 text-xs">
                    <span className="font-mono font-semibold text-foreground">{d.serie}</span>
                    <span className="font-medium">{d.codigo ?? "—"}</span>
                    <span className="text-muted-foreground">{[d.marca, d.modelo].filter(Boolean).join(" ")}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {(d.ubicacion ?? "PLANTA").toUpperCase()}
                      {d.empresa ? ` · ${d.empresa}` : ""}
                    </span>
                    <Button
                      size="sm"
                      className="ml-auto h-7"
                      disabled={pendiente}
                      onClick={() =>
                        iniciar(async () => {
                          const r = await registrarSerieDelEquipo(m.itemId, m.servicioId, d.serie);
                          if (r.error) return void toast.error(r.error);
                          setUsadas((u) => new Set(u).add(d.id));
                          toast.success(`Serie ${d.serie} puesta en el pedido de ${m.cliente}: reservada y Central avisada`);
                          router.refresh();
                        })
                      }
                    >
                      {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Usar esta
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AgregarAlStock({ codigos }: { codigos: CodigoParaAgregar[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [codigo, setCodigo] = useState("");
  const [series, setSeries] = useState("");
  const [empresa, setEmpresa] = useState<"" | "OPEN" | "EFAMEINSA">("");
  const [ubicacion, setUbicacion] = useState("PLANTA");
  const [ingreso, setIngreso] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }));
  const elegido = useMemo(() => codigos.find((c) => c.sku.toUpperCase() === codigo.trim().toUpperCase()) ?? null, [codigo, codigos]);
  const cuantas = series.split(/[\n,;\t]+/).map((s) => s.trim()).filter(Boolean).length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Lo que llega a planta entra acá, sin Excel. Elija el código del catálogo y pegue las series (una por línea). Si el código no existe, pídalo a Lesly en
        «Stock y códigos» → «Códigos y series».
      </p>
      <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} list="codigos-para-agregar" placeholder="Código (LAV350, SECD24…)" className="font-mono" />
          <datalist id="codigos-para-agregar">
            {codigos.map((c) => (
              <option key={c.id} value={c.sku}>
                {c.nombre}
              </option>
            ))}
          </datalist>
          <p className={cn("mt-0.5 text-[11px]", elegido ? "text-muted-foreground" : codigo ? "text-amber-700" : "text-muted-foreground")}>
            {elegido ? elegido.nombre : codigo ? "Ese código no está en el catálogo" : "Escriba o elija el código"}
          </p>
        </div>
        <select
          value={empresa}
          onChange={(e) => setEmpresa(e.target.value as "" | "OPEN" | "EFAMEINSA")}
          className={cn("h-9 rounded-md border border-border bg-background px-2 text-sm", !empresa && "text-muted-foreground")}
        >
          <option value="">¿De qué empresa?</option>
          <option value="OPEN">Open</option>
          <option value="EFAMEINSA">Efameinsa</option>
        </select>
        <Input value={ubicacion} onChange={(e) => setUbicacion(e.target.value.toUpperCase())} placeholder="Ubicación (PLANTA)" />
        <Input type="date" value={ingreso} onChange={(e) => setIngreso(e.target.value)} title="Fecha de ingreso" />
      </div>
      <Textarea value={series} onChange={(e) => setSeries(e.target.value)} rows={3} placeholder="Series como se leen en la placa, una por línea" className="font-mono text-sm" />
      <Button
        disabled={pendiente || !elegido || !empresa || cuantas === 0}
        onClick={() =>
          iniciar(async () => {
            const r = await cargarSeries(elegido!.id, series, ubicacion.trim() || null, { empresa: empresa || null, ingreso });
            if (r.error) return void toast.error(r.error);
            const avisos = [
              r.repetidas?.length ? `ya estaban: ${r.repetidas.join(", ")}` : "",
              r.invalidas?.length ? `no parecen series: ${r.invalidas.join(", ")}` : "",
            ].filter(Boolean);
            toast.success(`${r.cargadas ?? 0} ${r.cargadas === 1 ? "máquina entró" : "máquinas entraron"} al stock con ${elegido!.sku}${avisos.length ? ` · ${avisos.join(" · ")}` : ""}`, { duration: 8000 });
            if ((r.cargadas ?? 0) > 0) setSeries("");
            router.refresh();
          })
        }
      >
        {pendiente ? <Loader2 className="size-4 animate-spin" /> : <PackagePlus className="size-4" />}
        {cuantas > 0 ? `Agregar ${cuantas} ${cuantas === 1 ? "máquina" : "máquinas"} al stock` : "Agregar al stock"}
      </Button>
    </div>
  );
}
