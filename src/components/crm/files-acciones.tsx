"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, BellRing, Check, HandHelping, Loader2, Plus, Search, X } from "lucide-react";
import {
  anularPedidoFile,
  buscarClientesParaFile,
  confirmarFileRecibido,
  devolverFile,
  entregarFile,
  entregarFileDirecto,
  personasParaRecibirFile,
  solicitarFiles,
  termineConElFile,
  type ClienteParaFile,
  type EmpresaFile,
  type PersonaParaFile,
} from "@/lib/acciones/files";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { horaLima, recordarDesde } from "@/lib/files-recojo";
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

/**
 * «TERMINÉ, PUEDEN RECOGERLO» (0350). Carlos, 30-09: «que me lleve una
 * notificación para ir a recoger el file… el botoncito donde dice files,
 * Terminé». El primer clic avisa a Central; después el botón se vuelve
 * «Recordar a Central», que solo se habilita cada 30 minutos (la base
 * también lo impide) para no llenarle la campana.
 *
 * `cuantos` > 1: el botón del pedido entero, un solo aviso para todos.
 */
export function AccionTermine({
  id,
  ultimoAviso,
  cuantos = 1,
  variante = "default",
}: {
  id: string;
  ultimoAviso: string | null;
  cuantos?: number;
  variante?: "default" | "outline";
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [ahora, setAhora] = useState(() => new Date());
  // El botón se habilita solo cuando se cumplen los 30 minutos, sin recargar.
  useEffect(() => {
    if (!ultimoAviso) return;
    const t = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(t);
  }, [ultimoAviso]);
  const espera = recordarDesde(ultimoAviso, ahora);

  function hacer() {
    startTransition(async () => {
      const r = await termineConElFile(id, cuantos > 1);
      if (r.error) return void toast.error(r.error, { duration: 9000 });
      toast.success(ultimoAviso ? "Le recordamos a Central que pase a recogerlo" : `Avisado a Central: pasará a recoger ${cuantos > 1 ? `los ${cuantos} files` : "el file"}`);
      router.refresh();
    });
  }

  const etiqueta = !ultimoAviso
    ? cuantos > 1 ? `Terminé con los ${cuantos}, pueden recogerlos` : "Terminé, pueden recogerlo"
    : espera ? `Recordar desde las ${horaLima(espera)}` : "Recordar a Central";
  return (
    <Button size="sm" variant={ultimoAviso ? "outline" : variante} onClick={hacer} disabled={pendiente || Boolean(espera)} className="whitespace-nowrap tabular-nums">
      {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <BellRing className="size-3.5" />}
      {etiqueta}
    </Button>
  );
}

/**
 * ENTREGA DIRECTA DEL FILE (0365). Carlos, reunión 01-10 11:05: «Lo único que
 * tiene que hacer Alondra es agarrar el expediente y físicamente llevarle a
 * postventa… pero esa entrega no está registrada… yo te entrego porque hemos
 * generado un pedido. Entonces no sé si lo enlazamos».
 *
 * Con `pedido`: el botón del paso «Generar el pedido» en los cierres de
 * Central; el cliente y el pedido ya vienen dados y la persona sugerida es
 * quien tiene ese cliente en postventa. Sin `pedido`: «Entregar sin pedido»
 * en /files, buscando el cliente. En los dos casos quien recibe firma
 * «Recibí el file» y sigue el circuito de siempre.
 */
export function EntregarFileDirecto({
  pedido = null,
}: {
  pedido?: { servicioId: string; numero: string; cuentaId: string; cliente: string; empresa: EmpresaFile | null } | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [personas, setPersonas] = useState<PersonaParaFile[]>([]);
  const [a, setA] = useState("");
  const [marca, setMarca] = useState<Marca>({
    open: pedido?.empresa === "open" || pedido?.empresa === "ambos",
    efameinsa: pedido?.empresa === "efameinsa" || pedido?.empresa === "ambos",
  });
  const [cliente, setCliente] = useState<{ id: string; nombre: string } | null>(pedido ? { id: pedido.cuentaId, nombre: pedido.cliente } : null);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ClienteParaFile[]>([]);
  const [nota, setNota] = useState("");
  const [enviando, startTransition] = useTransition();
  const turno = useRef(0);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function abrir() {
    setAbierto(true);
    if (personas.length > 0) return;
    setCargando(true);
    const r = await personasParaRecibirFile({ servicioId: pedido?.servicioId ?? null, cuentaId: pedido?.cuentaId ?? null });
    setPersonas(r.personas);
    if (r.sugerida) setA(r.sugerida);
    setCargando(false);
  }

  function escribir(valor: string) {
    setQ(valor);
    if (espera.current) clearTimeout(espera.current);
    const texto = valor.trim();
    const mio = ++turno.current;
    if (texto.length < 3) return void setResultados([]);
    espera.current = setTimeout(async () => {
      const r = await buscarClientesParaFile(texto);
      if (mio === turno.current) setResultados(r);
    }, 300);
  }

  function registrar() {
    const empresa = empresaDe(marca);
    if (!cliente) return void toast.error("Elija el cliente");
    if (!a) return void toast.error("Elija a quién se lo entrega");
    if (!empresa) return void toast.error("Marque OPEN, EFAMEINSA o ambos");
    startTransition(async () => {
      const r = await entregarFileDirecto({ cuenta: cliente.id, a, empresa, pedido: pedido?.servicioId ?? null, nota: nota || null });
      if (r.error) return void toast.error(r.error, { duration: 9000 });
      const nombre = personas.find((p) => p.id === a)?.nombre ?? "postventa";
      toast.success(`Entrega registrada: a ${nombre} le llegó el aviso para firmar «Recibí el file»`);
      setAbierto(false);
      if (!pedido) {
        setCliente(null);
        setNota("");
        setMarca({ open: false, efameinsa: false });
      }
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <Button size="sm" variant="outline" className="mt-1.5" onClick={abrir}>
        <HandHelping className="size-3.5" /> {pedido ? "Entregar el file a postventa" : "Entregar sin pedido"}
      </Button>
    );
  }

  const dePostventa = personas.filter((p) => p.postventa);
  const otras = personas.filter((p) => !p.postventa);
  const etiqueta = (p: PersonaParaFile) => `${p.codigo ? `${p.codigo} · ` : ""}${p.nombre}`;

  return (
    <div className="mt-1.5 grid gap-1.5 rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
      {pedido ? (
        <p className="text-muted-foreground">
          File de <b className="text-foreground">{pedido.cliente}</b>, en la mano por el pedido <b className="font-mono text-foreground">{pedido.numero}</b>.
        </p>
      ) : cliente ? (
        <p className="flex items-center gap-2">
          <Archive className="size-3.5 text-primary" />
          <b className="min-w-0 flex-1 truncate">{cliente.nombre}</b>
          <button type="button" onClick={() => setCliente(null)} className="text-muted-foreground hover:text-destructive" aria-label="Cambiar el cliente">
            <X className="size-3.5" />
          </button>
        </p>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 pl-8 text-xs" value={q} onChange={(e) => escribir(e.target.value)} placeholder="Cliente por nombre o RUC (mínimo 3 letras)" autoFocus />
          {resultados.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
              {resultados.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCliente({ id: c.id, nombre: c.razonSocial });
                      escribir("");
                    }}
                    className="block w-full px-3 py-1.5 text-left hover:bg-accent"
                  >
                    <span className="block truncate font-medium">{c.razonSocial}</span>
                    <span className="text-muted-foreground">{c.documento ?? "sin documento"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <label className="grid gap-0.5">
        <span className="font-semibold text-foreground">Se lo entrega a</span>
        {cargando ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Cargando…
          </span>
        ) : (
          // Select nativo: el de Base UI muestra el valor crudo (el id) hasta que se elige.
          <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={a} onChange={(e) => setA(e.target.value)}>
            <option value="">Elija a la persona…</option>
            {dePostventa.length > 0 && (
              <optgroup label="Postventa">
                {dePostventa.map((p) => (
                  <option key={p.id} value={p.id}>
                    {etiqueta(p)}
                  </option>
                ))}
              </optgroup>
            )}
            {otras.length > 0 && (
              <optgroup label="Otras áreas">
                {otras.map((p) => (
                  <option key={p.id} value={p.id}>
                    {etiqueta(p)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        )}
      </label>

      <span className={cn("flex items-center gap-3 font-semibold", !empresaDe(marca) && "text-amber-800")}>
        {(["open", "efameinsa"] as const).map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" className="size-4 accent-primary" checked={marca[k]} onChange={(e) => setMarca((v) => ({ ...v, [k]: e.target.checked }))} />
            {k === "open" ? "OPEN" : "EFAMEINSA"}
          </label>
        ))}
      </span>

      <Input className="h-8 text-xs" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" />

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={registrar} disabled={enviando || cargando || !a || !cliente || !empresaDe(marca)}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Registrar la entrega
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
