"use client";

// PEDIDOS AL CATÁLOGO (0523, Santos 17-10). A la izquierda se pide; a la
// derecha, los pedidos con la respuesta de Lesly. Ella (y gerencia y
// administración) ve los de todos y contesta desde la misma tarjeta.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, X, Send, MessageSquareReply, Inbox, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { enviarPedidoCatalogo, responderPedidoCatalogo } from "@/lib/acciones/pedidos-catalogo";
import {
  ESTADOS_PEDIDO_CATALOGO,
  TIPOS_PEDIDO_CATALOGO,
  type AdjuntoPedidoCatalogo,
  type EstadoPedidoCatalogo,
  type PedidoCatalogo,
  type TipoPedidoCatalogo,
} from "@/lib/pedidos-catalogo";
import { Galeria } from "@/components/crm/buzon-sugerencias";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fechaHoraLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

const MAX_IMAGENES = 10;
const MAX_MB = 8;

export function FormularioPedidoCatalogo({ userId }: { userId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  // Desde el buzón del CRM llega con lo que la persona ya había escrito.
  const [tipo, setTipo] = useState<TipoPedidoCatalogo | null>(null);
  const [titulo, setTitulo] = useState(params.get("titulo") ?? "");
  const [detalle, setDetalle] = useState(params.get("detalle") ?? "");
  const [producto, setProducto] = useState("");
  const [paraCliente, setParaCliente] = useState("");
  const [imagenes, setImagenes] = useState<{ archivo: File; vista: string }[]>([]);
  const [problema, setProblema] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const imagenesRef = useRef(imagenes);
  useEffect(() => {
    imagenesRef.current = imagenes;
  }, [imagenes]);
  useEffect(() => () => imagenesRef.current.forEach((c) => URL.revokeObjectURL(c.vista)), []);

  function agregar(archivos: File[]) {
    const validas = archivos.filter((f) => f.type.startsWith("image/") && f.size <= MAX_MB * 1024 * 1024);
    if (validas.length < archivos.length) toast.error(`Solo imágenes de hasta ${MAX_MB} MB (capturas, fotos).`);
    setImagenes((prev) => [
      ...prev,
      ...validas.slice(0, Math.max(0, MAX_IMAGENES - prev.length)).map((archivo) => ({ archivo, vista: URL.createObjectURL(archivo) })),
    ]);
  }

  useEffect(() => {
    function alPegar(e: ClipboardEvent) {
      const archivos = Array.from(e.clipboardData?.files ?? []);
      if (archivos.some((f) => f.type.startsWith("image/"))) {
        e.preventDefault();
        agregar(archivos.map((f, i) => (f.name === "image.png" ? new File([f], `captura-${Date.now()}-${i + 1}.png`, { type: f.type }) : f)));
      }
    }
    window.addEventListener("paste", alPegar);
    return () => window.removeEventListener("paste", alPegar);
  }, []);

  const falta = !tipo
    ? "Elija arriba qué necesita."
    : titulo.trim().length < 3
      ? "Escriba en una frase qué necesita."
      : (tipo === "corregir_producto" || tipo === "precio" || tipo === "stock") && producto.trim().length < 2
        ? "Escriba el código o el nombre del producto."
        : null;

  function enviar() {
    if (falta || !tipo) return;
    setProblema(null);
    iniciar(async () => {
      const adjuntos: AdjuntoPedidoCatalogo[] = [];
      const storage = createClient().storage.from("adjuntos");
      for (const { archivo } of imagenes) {
        const path = `catalogo-pedidos/${userId}/${crypto.randomUUID()}-${archivo.name.replace(/[^\w.\-]+/g, "_").slice(0, 80)}`;
        const { error } = await storage.upload(path, archivo, { contentType: archivo.type || "image/png" });
        if (error) {
          setProblema(`No se pudo subir «${archivo.name}». Quítela o intente de nuevo.`);
          return;
        }
        adjuntos.push({ path, nombre: archivo.name, tipo: archivo.type, tamano: archivo.size });
      }
      const r = await enviarPedidoCatalogo({ tipo, titulo, detalle, producto, paraCliente, adjuntos });
      if (r.error) {
        setProblema(r.error);
        return;
      }
      toast.success("Listo: el pedido le llegó a Lesly. La respuesta le llega a la campana.");
      imagenes.forEach((c) => URL.revokeObjectURL(c.vista));
      setImagenes([]);
      setTitulo("");
      setDetalle("");
      setProducto("");
      setParaCliente("");
      setTipo(null);
      router.replace("/pedidos-catalogo");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">1 · ¿Qué necesita?</p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {TIPOS_PEDIDO_CATALOGO.map((t) => (
            <button
              key={t.valor}
              type="button"
              onClick={() => setTipo(t.valor)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                tipo === t.valor ? "border-[#8B1510] bg-[#8B1510]/[0.06] ring-1 ring-[#8B1510]" : "border-border hover:border-[#8B1510]/40",
              )}
            >
              <span className="text-lg leading-none">{t.emoji}</span>
              <span className="mt-1 block text-sm font-semibold text-foreground">{t.etiqueta}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{t.ayuda}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          ¿Un rubro nuevo? No hace falta pedirlo: en la ficha del cliente, «Cambiar rubro» → «＋ Agregar un rubro nuevo».
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2 · Cuéntelo</p>
        <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={140} placeholder="En una frase. Ej.: «Agregar la secadora UNIMAC UT075 a gas»" />
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={producto} onChange={(e) => setProducto(e.target.value)} maxLength={200} placeholder="Código o nombre del producto (si existe)" />
          <Input value={paraCliente} onChange={(e) => setParaCliente(e.target.value)} maxLength={200} placeholder="¿Para qué cliente? (opcional, ayuda a priorizar)" />
        </div>
        <Textarea
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          rows={4}
          maxLength={5000}
          placeholder={"Lo que Lesly necesita saber: el precio que le dio el proveedor, qué dice mal la ficha, para cuándo lo necesita…"}
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">3 · Imágenes (opcional)</p>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            agregar(Array.from(e.dataTransfer.files));
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border px-4 py-5 text-center transition-colors hover:border-[#8B1510]/50 hover:bg-secondary/40"
        >
          <ImagePlus className="size-5 text-[#8B1510]" />
          <p className="text-sm font-medium text-foreground">Pegue con Ctrl + V, arrastre o haga clic</p>
          <p className="text-[11px] text-muted-foreground">La ficha del proveedor, una foto del equipo o la captura de lo que está mal.</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              agregar(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
        {imagenes.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {imagenes.map((c, i) => (
              <div key={c.vista} className="relative overflow-hidden rounded-md border border-border bg-secondary/40">
                {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
                <img src={c.vista} alt={c.archivo.name} className="aspect-video w-full object-cover" />
                <button
                  type="button"
                  onClick={() =>
                    setImagenes((prev) => {
                      URL.revokeObjectURL(prev[i].vista);
                      return prev.filter((_, j) => j !== i);
                    })
                  }
                  className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  aria-label={`Quitar ${c.archivo.name}`}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {problema && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs leading-snug text-destructive">
          {problema}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {falta && <span className="text-[11px] text-muted-foreground">{falta}</span>}
        <Button onClick={enviar} disabled={Boolean(falta) || enviando} className="gap-1.5">
          <Send className="size-4" /> {enviando ? "Enviando…" : "Mandárselo a Lesly"}
        </Button>
      </div>
    </div>
  );
}

function Estado({ estado }: { estado: EstadoPedidoCatalogo }) {
  const e = ESTADOS_PEDIDO_CATALOGO.find((x) => x.valor === estado)!;
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", e.clase)}>{e.etiqueta}</span>;
}

function Contestar({ p }: { p: PedidoCatalogo }) {
  const router = useRouter();
  const [respuesta, setRespuesta] = useState(p.respuesta ?? "");
  const [problema, setProblema] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();
  const sinTexto = respuesta.trim().length < 3;

  function guardar(estado: Exclude<EstadoPedidoCatalogo, "nuevo">) {
    setProblema(null);
    iniciar(async () => {
      const r = await responderPedidoCatalogo(p.id, estado, respuesta);
      if (r.error) setProblema(r.error);
      else {
        toast.success(estado === "en_proceso" ? "Marcado: lo está viendo" : "Respuesta enviada");
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <Textarea
        value={respuesta}
        onChange={(e) => setRespuesta(e.target.value)}
        rows={2}
        placeholder="Respuesta para quien lo pidió (le llega a la campana). Ej.: «Ya está en el catálogo con el código UT075G»."
      />
      {problema && (
        <p role="alert" className="text-xs text-destructive">
          {problema}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {sinTexto && <span className="text-[11px] text-muted-foreground">Para «Hecho» o «No procede», escriba la respuesta.</span>}
        {p.estado === "nuevo" && (
          <Button size="sm" variant="outline" disabled={guardando} onClick={() => guardar("en_proceso")}>
            Lo estoy viendo
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={guardando || sinTexto} porQue={sinTexto ? "Escriba la respuesta primero." : null} onClick={() => guardar("no_procede")}>
          No procede
        </Button>
        <Button size="sm" disabled={guardando || sinTexto} porQue={sinTexto ? "Escriba la respuesta primero." : null} onClick={() => guardar("hecho")}>
          {guardando ? "Guardando…" : "Hecho"}
        </Button>
      </div>
    </div>
  );
}

function Tarjeta({ p, atiende, mostrarAutor, resaltada }: { p: PedidoCatalogo; atiende: boolean; mostrarAutor: boolean; resaltada: boolean }) {
  const tipo = TIPOS_PEDIDO_CATALOGO.find((t) => t.valor === p.tipo)!;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (resaltada) ref.current?.scrollIntoView({ block: "center" });
  }, [resaltada]);
  const abierto = p.estado === "nuevo" || p.estado === "en_proceso";
  return (
    <div ref={ref} className={cn("rounded-lg border bg-card p-4", resaltada ? "border-[#8B1510] ring-1 ring-[#8B1510]" : "border-border")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            <span className="mr-1">{tipo.emoji}</span>
            {p.titulo}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {mostrarAutor && (
              <b className="font-semibold text-foreground">
                {p.autor_nombre}
                {p.autor_codigo ? ` · ${p.autor_codigo}` : ""} ·{" "}
              </b>
            )}
            {tipo.etiqueta} · {fechaHoraLima(p.created_at)}
            {p.desde_buzon ? " · pasó del buzón del CRM" : ""}
          </p>
        </div>
        <Estado estado={p.estado} />
      </div>
      {(p.producto || p.para_cliente) && (
        <p className="mt-2 text-xs text-foreground/90">
          {p.producto && (
            <>
              Producto: <b>{p.producto}</b>
            </>
          )}
          {p.producto && p.para_cliente ? " · " : ""}
          {p.para_cliente && (
            <>
              Para: <b>{p.para_cliente}</b>
            </>
          )}
        </p>
      )}
      {p.detalle && <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{p.detalle}</p>}
      <Galeria adjuntos={p.adjuntos} />
      {p.respuesta && (!atiende || !abierto) && (
        <div className="mt-3 rounded-md border-l-4 border-[#8B1510] bg-[#8B1510]/[0.04] p-3">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-[#8B1510]">
            <MessageSquareReply className="size-3.5" /> Respuesta{p.respondida_por_nombre ? ` de ${p.respondida_por_nombre}` : ""}
            {p.respondida_at ? ` · ${fechaHoraLima(p.respondida_at)}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{p.respuesta}</p>
        </div>
      )}
      {atiende && abierto && <Contestar p={p} />}
    </div>
  );
}

export function ListaPedidosCatalogo({ pedidos, atiende, userId }: { pedidos: PedidoCatalogo[]; atiende: boolean; userId: string }) {
  const params = useSearchParams();
  const ver = params.get("ver");
  const [filtro, setFiltro] = useState<"abiertos" | "cerrados" | "todos">(atiende ? "abiertos" : "todos");
  const conteo = useMemo(
    () => ({
      abiertos: pedidos.filter((p) => p.estado === "nuevo" || p.estado === "en_proceso").length,
      cerrados: pedidos.filter((p) => p.estado === "hecho" || p.estado === "no_procede").length,
      todos: pedidos.length,
    }),
    [pedidos],
  );
  const lista = pedidos.filter((p) => {
    if (p.id === ver) return true;
    const abierto = p.estado === "nuevo" || p.estado === "en_proceso";
    return filtro === "todos" || (filtro === "abiertos" ? abierto : !abierto);
  });

  return (
    <div className="space-y-3">
      {atiende && (
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { valor: "abiertos", etiqueta: "Por atender" },
              { valor: "cerrados", etiqueta: "Atendidos" },
              { valor: "todos", etiqueta: "Todos" },
            ] as const
          ).map((e) => (
            <button
              key={e.valor}
              type="button"
              onClick={() => setFiltro(e.valor)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filtro === e.valor ? "border-[#8B1510] bg-[#8B1510] text-white" : "border-border text-muted-foreground hover:border-[#8B1510]/50",
              )}
            >
              {e.etiqueta}
              <span className="ml-1 tabular-nums opacity-80">{conteo[e.valor]}</span>
            </button>
          ))}
        </div>
      )}
      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {atiende ? <Inbox className="size-6" /> : <Clock className="size-6" />}
          {atiende
            ? filtro === "abiertos"
              ? "No hay pedidos por atender."
              : "No hay pedidos en esta vista."
            : "Todavía no ha pedido nada al catálogo. Lo que pida a la izquierda aparece aquí, con la respuesta de Lesly."}
        </div>
      ) : (
        lista.map((p) => <Tarjeta key={p.id} p={p} atiende={atiende} mostrarAutor={atiende && p.autor_id !== userId} resaltada={p.id === ver} />)
      )}
    </div>
  );
}
