"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boxes, ChevronDown, ChevronRight, Scale, Search, Ship } from "lucide-react";
import { cotejarCatalogo, guardarProyeccion, marcarProyeccion, type Proyeccion } from "@/lib/acciones/inventario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TablaPorCodigo, TablaPorSerie, type MaquinaTabla } from "@/components/crm/almacen-tabla";

export type FilaAlmacen = MaquinaTabla;

/**
 * EL ALMACÉN POR SERIE (Carlos, reunión 22-10-2026 10:29).
 *
 * «Este es el listado principal… la punta de partida»: una fila por máquina
 * física, numerada, con su código, su serie, dónde está, cuándo entró y de qué
 * empresa es (Open o Efameinsa). Arriba, lo que Carlos buscó y no encontró en
 * pantalla: el total de equipos (por proveedor y tipo, y LG por modelo), lo
 * que está por llegar de Importaciones (se ve, no suma) y el cotejo con el
 * catálogo («¿ya se actualizó el stock que había en el CRM con esto?»).
 *
 * Y lo automático: la máquina que Central pidió para un pedido aparece
 * RESERVADA con el cliente y el pedido, la que salió aparece DESPACHADA, y si
 * el pedido cambia la máquina vuelve sola. Lesly ya no corta y pega en su Excel.
 */

export interface TotalesAlmacen {
  industriales: { proveedor: string; total: number; secciones: { titulo: string; total: number }[] }[];
  totalIndustriales: number;
  lg: { titulo: string; total: number; modelos: { modelo: string; codigo: string | null; stock: number }[] }[];
  totalLg: number;
}

export interface FilaContraste {
  sku: string;
  nombre: string;
  ficha: "activa" | "en preparación" | "retirada";
  /** La cifra vieja del maestro que el catálogo venía mostrando como «(ref.)». */
  ref: number;
  /** Contadas por serie en el almacén (disponibles). */
  almacen: number;
  /** Marcadas para subir en la carga que está en revisión. */
  carga: number;
}

type Vista = "planta" | "disponible" | "reservado" | "despachado" | "todas";

const fecha = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

export function AlmacenPorSerie({
  filas,
  totales,
  contraste,
  proyeccion,
  puedeEditar,
  verCosto = true,
}: {
  filas: FilaAlmacen[];
  totales: TotalesAlmacen;
  contraste: FilaContraste[];
  proyeccion: Proyeccion[];
  puedeEditar: boolean;
  /** El costo solo lo ven operaciones y gerencia (0596): en el módulo del almacén va sin esa columna. */
  verCosto?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [vista, setVista] = useState<Vista>("planta");
  const [marca, setMarca] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [empresa, setEmpresa] = useState("");
  // «Por código» (una fila por código, con sus series al abrir) es la lectura de todos los
  // días; «Por serie» es la lista plana numerada para contar o cotejar.
  const [modo, setModo] = useState<"codigo" | "serie">("codigo");

  const marcas = useMemo(() => [...new Set(filas.map((f) => (f.marca ?? "").toUpperCase()).filter(Boolean))].sort(), [filas]);
  const proveedores = useMemo(() => [...new Set(filas.map((f) => (f.proveedor ?? "").toUpperCase()).filter(Boolean))].sort(), [filas]);
  const cuenta = useMemo(() => {
    const c = { disponible: 0, reservado: 0, despachado: 0 };
    for (const f of filas) if (f.estado in c) c[f.estado as keyof typeof c]++;
    return c;
  }, [filas]);
  const enCamino = proyeccion.filter((p) => p.estado === "en_camino").reduce((a, p) => a + p.cantidad, 0);

  const lista = useMemo(() => {
    const tokens = texto.toUpperCase().split(/\s+/).filter(Boolean);
    return filas
      .filter((f) => {
        if (vista === "planta") return f.estado === "disponible" || f.estado === "reservado";
        if (vista === "todas") return true;
        return f.estado === vista;
      })
      .filter((f) => !marca || (f.marca ?? "").toUpperCase() === marca)
      .filter((f) => !proveedor || (f.proveedor ?? "").toUpperCase() === proveedor)
      .filter((f) => !empresa || (empresa === "SIN" ? !f.empresa : (f.empresa ?? "").toUpperCase() === empresa))
      .filter((f) => {
        if (tokens.length === 0) return true;
        const pajar = `${f.codigo ?? ""} ${f.marca ?? ""} ${f.modelo} ${f.descripcion} ${f.serie} ${f.item ?? ""} ${f.cliente ?? ""} ${f.pedido ?? ""} ${f.empresa ?? ""} ${f.proveedor ?? ""}`.toUpperCase();
        return tokens.every((t) => pajar.includes(t));
      });
  }, [filas, texto, vista, marca, proveedor, empresa]);

  const chips: { clave: Vista; texto: string }[] = [
    { clave: "planta", texto: `En planta (${cuenta.disponible + cuenta.reservado})` },
    { clave: "disponible", texto: `Disponibles (${cuenta.disponible})` },
    { clave: "reservado", texto: `Reservadas (${cuenta.reservado})` },
    { clave: "despachado", texto: `Despachadas (${cuenta.despachado})` },
    { clave: "todas", texto: "Todas" },
  ];

  return (
    <div className="space-y-4">
      {/* Los números de arriba: lo primero que Carlos buscó («¿dónde vemos el total de equipos?»). */}
      <div className="grid gap-2 sm:grid-cols-4">
        <Cifra n={cuenta.disponible} texto="disponibles en planta" tono="verde" />
        <Cifra n={cuenta.reservado} texto="reservadas para un pedido" tono="ambar" />
        <Cifra n={cuenta.despachado} texto="despachadas (ya salieron)" tono="gris" />
        <Cifra n={enCamino} texto="en camino (no suman)" tono="azul" />
      </div>

      <Totales totales={totales} />
      <Proyectado proyeccion={proyeccion} puedeEditar={puedeEditar} />
      <Contraste contraste={contraste} puedeEditar={puedeEditar} hayAlmacen={cuenta.disponible > 0} />

      <div className="space-y-3 rounded-xl border border-border p-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Boxes className="size-4" /> Máquinas, una por serie
          </p>
          <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
            Cuando el almacén registra la serie en un pedido, la máquina queda <strong>reservada</strong> para ese cliente; al registrar la salida, queda{" "}
            <strong>despachada</strong>; si se quita o se corrige la serie en el pedido, vuelve a estar disponible. No hace falta tocar nada aquí.
          </p>
        </div>
        {filas.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">El almacén todavía no tiene máquinas.</p>
            <p className="mt-1 max-w-prose">
              Se llena desde la pestaña «Subir el Excel de stock»: al leer el Excel de Importaciones, las máquinas entran aquí con su serie en el acto, y el
              catálogo y el cotizador cuentan el stock por serie. Solo quedan fuera las que tienen observaciones, hasta resolverlas.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px] flex-1">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código, modelo, serie, cliente, pedido…" className="pl-8" />
              </div>
              <select value={proveedor} onChange={(e) => setProveedor(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm" title="Proveedor (Alliance, GMP, Sailstar…)">
                <option value="">Todos los proveedores</option>
                {proveedores.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <select value={marca} onChange={(e) => setMarca(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm" title="Marca (Primus, Unimac, LG…)">
                <option value="">Todas las marcas</option>
                {marcas.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm" title="De qué empresa es la máquina">
                <option value="">Open y Efameinsa</option>
                <option value="OPEN">Solo OPEN</option>
                <option value="EFAMEINSA">Solo EFAMEINSA</option>
                <option value="SIN">Sin empresa puesta</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <button
                  key={c.clave}
                  type="button"
                  onClick={() => setVista(c.clave)}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                    vista === c.clave ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c.texto}
                </button>
              ))}
              <span className="ml-auto flex items-center gap-1 self-center text-xs text-muted-foreground">
                {lista.length} {lista.length === 1 ? "máquina" : "máquinas"} ·
                <button type="button" onClick={() => setModo("codigo")} className={cn("rounded-full px-2 py-0.5 font-medium", modo === "codigo" ? "bg-foreground text-background" : "hover:text-foreground")}>
                  Por código
                </button>
                <button type="button" onClick={() => setModo("serie")} className={cn("rounded-full px-2 py-0.5 font-medium", modo === "serie" ? "bg-foreground text-background" : "hover:text-foreground")}>
                  Por serie
                </button>
              </span>
            </div>

            {lista.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ninguna máquina coincide con ese filtro.</p>
            ) : modo === "codigo" ? (
              <TablaPorCodigo filas={lista} opciones={{ puedeEditar, verIngreso: true, verCliente: true, verCosto }} />
            ) : (
              <TablaPorSerie filas={lista} opciones={{ puedeEditar, verIngreso: true, verCliente: true, verCosto }} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Cifra({ n, texto, tono }: { n: number; texto: string; tono: "verde" | "ambar" | "gris" | "azul" }) {
  const color = { verde: "text-emerald-700", ambar: "text-amber-700", gris: "text-muted-foreground", azul: "text-sky-700" }[tono];
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className={cn("text-xl font-semibold tabular-nums", color)}>{n}</p>
      <p className="text-[11px] text-muted-foreground">{texto}</p>
    </div>
  );
}

function Plegable({ titulo, resumen, icono, abiertoAlInicio = false, children }: { titulo: string; resumen?: string; icono: React.ReactNode; abiertoAlInicio?: boolean; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(abiertoAlInicio);
  return (
    <section className="rounded-xl border border-border">
      <button type="button" onClick={() => setAbierto(!abierto)} className="flex w-full flex-wrap items-center gap-2 p-3 text-left hover:bg-accent/40">
        {abierto ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
        {icono}
        <span className="text-sm font-medium text-foreground">{titulo}</span>
        {resumen && <span className="text-xs text-muted-foreground">{resumen}</span>}
      </button>
      {abierto && <div className="border-t border-border p-3">{children}</div>}
    </section>
  );
}

/** Los totales como en la hoja de Importaciones: por proveedor y tipo, y LG por modelo. */
function Totales({ totales }: { totales: TotalesAlmacen }) {
  const resumen = [
    ...totales.industriales.map((b) => `${b.proveedor} ${b.total}`),
    totales.totalLg > 0 ? `LG ${totales.totalLg}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Plegable titulo="Totales por proveedor, tipo y modelo" resumen={resumen || "sin máquinas disponibles"} icono={<Scale className="size-4 text-muted-foreground" />}>
      {totales.totalIndustriales === 0 && totales.totalLg === 0 ? (
        <p className="text-xs text-muted-foreground">Cuando haya máquinas disponibles, aquí se ven los totales por proveedor y tipo (industriales) y por modelo (LG), igual que en el PDF.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Industriales · {totales.totalIndustriales}</p>
            <ul className="space-y-1 text-xs">
              {totales.industriales.map((b) => (
                <li key={b.proveedor} className="rounded-md border border-border px-2 py-1">
                  <span className="flex justify-between font-medium text-foreground">
                    <span>{b.proveedor}</span>
                    <span className="tabular-nums">{b.total}</span>
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{b.secciones.map((s) => `${s.titulo.toLowerCase()} ${s.total}`).join(" · ")}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">LG · {totales.totalLg}</p>
            <ul className="space-y-1 text-xs">
              {totales.lg.map((s) => (
                <li key={s.titulo} className="rounded-md border border-border px-2 py-1">
                  <span className="flex justify-between font-medium text-foreground">
                    <span>{s.titulo}</span>
                    <span className="tabular-nums">{s.total}</span>
                  </span>
                  {s.modelos.map((m) => (
                    <span key={`${s.titulo}-${m.codigo ?? m.modelo}`} className="flex justify-between text-[11px] text-muted-foreground">
                      <span>
                        {m.modelo}
                        {m.codigo && <span className="ml-1 font-mono">{m.codigo}</span>}
                      </span>
                      <span className="tabular-nums">{m.stock}</span>
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Plegable>
  );
}

/** Lo que Importaciones tiene por llegar: se ve y se vende, no suma (Carlos 22-10). */
function Proyectado({ proyeccion, puedeEditar }: { proyeccion: Proyeccion[]; puedeEditar: boolean }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [problema, setProblema] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [f, setF] = useState({ codigo: "", descripcion: "", cantidad: "", fechaEstimada: "", proveedor: "", referencia: "", nota: "" });
  const enCamino = proyeccion.filter((p) => p.estado === "en_camino");
  const total = enCamino.reduce((a, p) => a + p.cantidad, 0);

  function guardar() {
    setProblema(null);
    empezar(async () => {
      const r = await guardarProyeccion({
        codigo: f.codigo,
        descripcion: f.descripcion,
        cantidad: Number(f.cantidad),
        fechaEstimada: f.fechaEstimada || null,
        proveedor: f.proveedor || null,
        referencia: f.referencia || null,
        nota: f.nota || null,
      });
      if (r.error) return setProblema(r.error);
      toast.success("Anotado: el comercial ya lo ve como «en camino».");
      setF({ codigo: "", descripcion: "", cantidad: "", fechaEstimada: "", proveedor: "", referencia: "", nota: "" });
      setAgregando(false);
      router.refresh();
    });
  }
  function marcar(id: string, estado: Proyeccion["estado"]) {
    setProblema(null);
    empezar(async () => {
      const r = await marcarProyeccion(id, estado);
      if (r.error) return setProblema(r.error);
      toast.success(estado === "llego" ? "Marcado como llegado. Cuando venga en el Excel de stock, entra al almacén con su serie." : "Quitado de lo que viene.");
      router.refresh();
    });
  }

  return (
    <Plegable
      titulo="Lo que está por llegar (proyección)"
      resumen={enCamino.length === 0 ? "nada anotado" : `${total} ${total === 1 ? "equipo" : "equipos"} en ${enCamino.length} ${enCamino.length === 1 ? "llegada" : "llegadas"} · no suman al stock`}
      icono={<Ship className="size-4 text-muted-foreground" />}
      abiertoAlInicio={enCamino.length > 0 || puedeEditar}
    >
      <p className="mb-2 max-w-prose text-xs text-muted-foreground">
        Lo que Importaciones ya compró y está en camino, con la fecha estimada. El comercial lo ve en «Stock» y en el catálogo como «en camino» para
        poder venderlo; no se suma a los totales. Cuando llega y viene en el Excel de stock, entra al almacén con su serie.
      </p>
      {enCamino.length > 0 && (
        <table className="mb-2 w-full text-xs">
          <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-1 text-left">Código</th>
              <th className="py-1 text-left">Equipo</th>
              <th className="py-1 text-right">Cant.</th>
              <th className="py-1 text-left">Llega</th>
              <th className="py-1 text-left">Proveedor · referencia</th>
              {puedeEditar && <th />}
            </tr>
          </thead>
          <tbody>
            {enCamino.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="py-1 font-mono font-semibold">{p.codigo ?? "—"}</td>
                <td className="py-1">
                  {p.descripcion}
                  {p.nota && <span className="block text-[11px] text-muted-foreground">{p.nota}</span>}
                </td>
                <td className="py-1 text-right tabular-nums">{p.cantidad}</td>
                <td className="py-1 tabular-nums">{p.fechaEstimada ? fecha(p.fechaEstimada) : "sin fecha"}</td>
                <td className="py-1 text-muted-foreground">{[p.proveedor, p.referencia].filter(Boolean).join(" · ") || "—"}</td>
                {puedeEditar && (
                  <td className="py-1 text-right">
                    <Button variant="ghost" size="sm" className="h-7" disabled={pendiente} onClick={() => marcar(p.id, "llego")}>Ya llegó</Button>
                    <Button variant="ghost" size="sm" className="h-7 text-muted-foreground" disabled={pendiente} onClick={() => marcar(p.id, "cancelada")}>Quitar</Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {puedeEditar &&
        (agregando ? (
          <div className="space-y-2 rounded-md border border-border p-2">
            <div className="grid gap-2 sm:grid-cols-3">
              <Input value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} placeholder="Código del catálogo (LAVMA172)" className="h-8 font-mono text-sm uppercase" />
              <Input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} placeholder="Qué viene (si no hay código)" className="h-8 text-sm sm:col-span-2" />
              <Input value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} placeholder="Cantidad" type="number" min={1} className="h-8 text-sm" />
              <Input value={f.fechaEstimada} onChange={(e) => setF({ ...f, fechaEstimada: e.target.value })} type="date" className="h-8 text-sm" title="Fecha estimada de llegada a planta" />
              <Input value={f.proveedor} onChange={(e) => setF({ ...f, proveedor: e.target.value })} placeholder="Proveedor" className="h-8 text-sm" />
              <Input value={f.referencia} onChange={(e) => setF({ ...f, referencia: e.target.value })} placeholder="Contenedor / orden de compra" className="h-8 text-sm" />
              <Input value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} placeholder="Nota" className="h-8 text-sm sm:col-span-2" />
            </div>
            {problema && <p role="alert" className="text-xs text-destructive">{problema}</p>}
            <div className="flex gap-2">
              <Button size="sm" className="h-8" disabled={pendiente || !f.cantidad || (!f.codigo.trim() && !f.descripcion.trim())} onClick={guardar}>
                Anotar llegada
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setAgregando(false)}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="h-8" onClick={() => setAgregando(true)}>
            <Ship className="size-3.5" /> Anotar lo que viene
          </Button>
        ))}
      {!puedeEditar && problema && <p className="text-xs text-destructive">{problema}</p>}
    </Plegable>
  );
}

/** El cotejo: la cifra vieja del catálogo contra lo que el almacén cuenta por serie. */
function Contraste({ contraste, puedeEditar, hayAlmacen }: { contraste: FilaContraste[]; puedeEditar: boolean; hayAlmacen: boolean }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [problema, setProblema] = useState<string | null>(null);
  const [soloDistintos, setSoloDistintos] = useState(true);
  const conProblema = contraste.filter((c) => c.ref !== (hayAlmacen ? c.almacen : c.carga) || c.ficha !== "activa");
  const lista = soloDistintos ? conProblema : contraste;
  const sinFicha = contraste.filter((c) => c.ficha !== "activa" && (c.almacen > 0 || c.carga > 0)).length;
  const refVieja = contraste.filter((c) => c.ref > 0 && c.almacen === 0 && c.carga === 0).length;

  function cotejar() {
    setProblema(null);
    empezar(async () => {
      const r = await cotejarCatalogo();
      if (r.error) return setProblema(r.error);
      toast.success(`Cotejado: ${r.puestosEnCero} códigos dejaron de mostrar la cifra vieja.`);
      router.refresh();
    });
  }

  return (
    <Plegable
      titulo="Cotejo con el catálogo"
      resumen={
        contraste.length === 0
          ? "sin diferencias que mostrar"
          : `${refVieja} ${refVieja === 1 ? "código muestra" : "códigos muestran"} una cifra vieja · ${sinFicha} sin ficha activa`
      }
      icono={<Scale className="size-4 text-muted-foreground" />}
    >
      <p className="mb-2 max-w-prose text-xs text-muted-foreground">
        El catálogo venía mostrando la cifra «(ref.)» del maestro de agosto. Desde que el almacén se carga por serie, manda el almacén: al pulsar «Subir al
        almacén», los equipos que no vinieron en el Excel dejan de mostrar esa cifra vieja (se guarda la anterior). Los códigos nuevos sin ficha se cotizan
        recién cuando Lesly les hace la ficha y los activa.
      </p>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setSoloDistintos(!soloDistintos)} className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", soloDistintos ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
          Solo lo que no cuadra ({conProblema.length})
        </button>
        {puedeEditar && (
          <Button size="sm" variant="outline" className="ml-auto h-8" disabled={pendiente || !hayAlmacen} onClick={cotejar} title={hayAlmacen ? "Pone en cero la cifra vieja de los equipos que no están en el almacén" : "Primero suba el Excel al almacén"}>
            Cotejar el catálogo ahora
          </Button>
        )}
      </div>
      {problema && <p className="mb-2 text-xs text-destructive">{problema}</p>}
      {lista.length === 0 ? (
        <p className="text-xs text-muted-foreground">Todo cuadra.</p>
      ) : (
        <div className="max-h-80 overflow-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-1 text-left">Código</th>
                <th className="px-2 py-1 text-left">Equipo</th>
                <th className="px-2 py-1 text-left">Ficha</th>
                <th className="px-2 py-1 text-right" title="La cifra que el catálogo venía mostrando">Ref. vieja</th>
                <th className="px-2 py-1 text-right" title="Marcadas para subir en la carga en revisión">En la carga</th>
                <th className="px-2 py-1 text-right" title="Contadas por serie en el almacén">En almacén</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.sku} className="border-t border-border">
                  <td className="px-2 py-1 font-mono font-semibold">{c.sku}</td>
                  <td className="max-w-[300px] truncate px-2 py-1" title={c.nombre}>{c.nombre}</td>
                  <td className="px-2 py-1">
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", c.ficha === "activa" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900")}>{c.ficha}</span>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{c.ref}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{c.carga}</td>
                  <td className="px-2 py-1 text-right font-semibold tabular-nums">{c.almacen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Plegable>
  );
}
