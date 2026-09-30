"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, Check, Loader2, Plus, Search, X } from "lucide-react";
import {
  anularPedidoFile,
  buscarClientesParaFile,
  confirmarFileRecibido,
  devolverFile,
  entregarFile,
  solicitarFiles,
  type ClienteParaFile,
  type EmpresaFile,
} from "@/lib/acciones/files";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * PEDIR FILES (0334). Carlos, 24-09: «una pequeña vista que es solicitar, que
 * pueda jalar clientes: cliente 1, 2, 3, 4». Se busca por nombre o RUC, se
 * agregan los que hagan falta y se manda: a Central le llega a la campana.
 *
 * 30-09 (0341): cada cliente puede tener archivador en OPEN y en EFAMEINSA;
 * en cada uno se marca cuál se pide, o los dos. Sin marca no se manda.
 */
type Marca = { open: boolean; efameinsa: boolean };
const empresaDe = (m: Marca | undefined): EmpresaFile | null =>
  m?.open && m?.efameinsa ? "ambos" : m?.open ? "open" : m?.efameinsa ? "efameinsa" : null;

export function PedirFiles() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ClienteParaFile[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [elegidos, setElegidos] = useState<ClienteParaFile[]>([]);
  const [marcas, setMarcas] = useState<Record<string, Marca>>({});
  const [nota, setNota] = useState("");
  const [enviando, startTransition] = useTransition();
  const turno = useRef(0);

  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  function escribir(valor: string) {
    setQ(valor);
    if (espera.current) clearTimeout(espera.current);
    const texto = valor.trim();
    const mio = ++turno.current;
    if (texto.length < 3) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    espera.current = setTimeout(async () => {
      const r = await buscarClientesParaFile(texto);
      if (mio === turno.current) {
        setResultados(r);
        setBuscando(false);
      }
    }, 300);
  }

  const agregar = (c: ClienteParaFile) => {
    if (!elegidos.some((e) => e.id === c.id)) setElegidos((v) => [...v, c]);
    escribir("");
  };

  function enviar() {
    if (elegidos.length === 0) return void toast.error("Agregue al menos un cliente");
    const sinMarca = elegidos.filter((e) => !empresaDe(marcas[e.id]));
    if (sinMarca.length > 0) return void toast.error(`Marque OPEN, EFAMEINSA o ambos en ${sinMarca.length === 1 ? sinMarca[0].razonSocial : `${sinMarca.length} clientes`}`);
    startTransition(async () => {
      const r = await solicitarFiles(elegidos.map((e) => ({ cuenta: e.id, empresa: empresaDe(marcas[e.id])! })), nota.trim() || null);
      if (r.error) return void toast.error(r.error, { duration: 9000 });
      toast.success(`Pedido enviado a Central: ${elegidos.length} file${elegidos.length === 1 ? "" : "s"}`);
      setElegidos([]);
      setMarcas({});
      setNota("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => escribir(e.target.value)} placeholder="Buscar el cliente por nombre o RUC (mínimo 3 letras)" className="pl-9" />
        {buscando && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        {resultados.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
            {resultados.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => agregar(c)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.razonSocial}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.documento ?? "sin documento"}
                      {c.cartera ? ` · cartera ${c.cartera}` : ""}
                    </span>
                  </span>
                  <Plus className="size-4 flex-none text-primary" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {elegidos.length > 0 && (
        <ol className="space-y-1.5">
          {elegidos.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-sm">
              <span className="w-5 text-xs font-semibold text-muted-foreground">{i + 1}.</span>
              <Archive className="size-4 text-primary" />
              <span className="min-w-[10rem] flex-1 truncate">{c.razonSocial}</span>
              <span className={cn("flex items-center gap-3 rounded-md px-2 py-0.5 text-xs font-semibold", !empresaDe(marcas[c.id]) && "bg-amber-500/10 text-amber-800")}>
                {(["open", "efameinsa"] as const).map((k) => (
                  <label key={k} className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={Boolean(marcas[c.id]?.[k])}
                      onChange={(e) => setMarcas((v) => ({ ...v, [c.id]: { ...(v[c.id] ?? { open: false, efameinsa: false }), [k]: e.target.checked } }))}
                    />
                    {k === "open" ? "OPEN" : "EFAMEINSA"}
                  </label>
                ))}
              </span>
              <button type="button" onClick={() => setElegidos((v) => v.filter((e) => e.id !== c.id))} className="text-muted-foreground hover:text-destructive" aria-label={`Quitar ${c.razonSocial}`}>
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      )}

      <Textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Para qué lo necesita (opcional): revisar garantía, cotizar repuesto…" rows={2} />
      <Button onClick={enviar} disabled={enviando || elegidos.length === 0}>
        {enviando ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />}
        Pedir {elegidos.length > 0 ? `${elegidos.length} file${elegidos.length === 1 ? "" : "s"}` : "files"} a Central
      </Button>
    </div>
  );
}

type Accion = "entregar" | "recibi" | "devolver" | "anular";
const TEXTO: Record<Accion, { etiqueta: string; hecho: string }> = {
  entregar: { etiqueta: "Entregar", hecho: "Entregado: queda a su cargo hasta que lo devuelva" },
  recibi: { etiqueta: "Recibí el file", hecho: "Recepción firmada" },
  devolver: { etiqueta: "Devuelto", hecho: "Devuelto: tachado del cuaderno" },
  anular: { etiqueta: "Anular", hecho: "Pedido anulado" },
};

/** Un botón del cuaderno de cargos. */
export function AccionFile({ id, accion, variante = "outline" }: { id: string; accion: Accion; variante?: "default" | "outline" | "ghost" }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  function hacer() {
    startTransition(async () => {
      const r =
        accion === "entregar" ? await entregarFile(id)
        : accion === "recibi" ? await confirmarFileRecibido(id)
        : accion === "devolver" ? await devolverFile(id)
        : await anularPedidoFile(id, null);
      if (r.error) return void toast.error(r.error, { duration: 9000 });
      toast.success(TEXTO[accion].hecho);
      router.refresh();
    });
  }
  return (
    <Button size="sm" variant={variante} onClick={hacer} disabled={pendiente} className="whitespace-nowrap">
      {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : accion === "anular" ? <X className="size-3.5" /> : <Check className="size-3.5" />}
      {TEXTO[accion].etiqueta}
    </Button>
  );
}
