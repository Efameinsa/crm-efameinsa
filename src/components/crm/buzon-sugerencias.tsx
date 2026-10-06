"use client";

// BUZÓN DE SUGERENCIAS (0399, Santos 05-10): «que todos puedan dejar ahí sus
// comentarios pegando varios screenshots… bien bonito y fácil de usar, y yo
// pueda verlo luego desde la vista de admin».
//
// Las capturas se pegan con Ctrl+V (lo más rápido: Win+Shift+S y pegar), se
// arrastran o se eligen del equipo. El navegador las sube al bucket privado
// 'adjuntos' y la acción guarda solo los metadatos, igual que las gestiones.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, X, Send, ChevronLeft, ChevronRight, MessageSquareReply, Inbox, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { enviarSugerencia, atenderSugerencia } from "@/lib/acciones/sugerencias";
import {
  ESTADOS_SUGERENCIA,
  TIPOS_SUGERENCIA,
  nombreDePantalla,
  type AdjuntoSugerencia,
  type EstadoSugerencia,
  type Sugerencia,
  type TipoSugerencia,
} from "@/lib/sugerencias";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fechaHoraLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

const MAX_CAPTURAS = 10;
const MAX_MB = 8;

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------

export function FormularioSugerencia({ userId }: { userId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const desde = params.get("desde");
  const [tipo, setTipo] = useState<TipoSugerencia>("mejora");
  const [titulo, setTitulo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [pantalla, setPantalla] = useState(nombreDePantalla(desde) ?? "");
  const [capturas, setCapturas] = useState<{ archivo: File; vista: string }[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [enviando, iniciar] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Las vistas previas son URL locales del navegador: se liberan al salir.
  const capturasRef = useRef(capturas);
  useEffect(() => {
    capturasRef.current = capturas;
  }, [capturas]);
  useEffect(() => () => capturasRef.current.forEach((c) => URL.revokeObjectURL(c.vista)), []);

  function agregar(archivos: File[]) {
    const imagenes = archivos.filter((f) => f.type.startsWith("image/"));
    if (imagenes.length < archivos.length) toast.error("Solo se pueden adjuntar imágenes (capturas de pantalla, fotos).");
    const grandes = imagenes.filter((f) => f.size > MAX_MB * 1024 * 1024);
    if (grandes.length) toast.error(`Cada imagen puede pesar hasta ${MAX_MB} MB.`);
    const validas = imagenes.filter((f) => f.size <= MAX_MB * 1024 * 1024);
    setCapturas((prev) => {
      const espacio = MAX_CAPTURAS - prev.length;
      if (validas.length > espacio) toast.error(`Máximo ${MAX_CAPTURAS} capturas por sugerencia.`);
      return [...prev, ...validas.slice(0, Math.max(0, espacio)).map((archivo) => ({ archivo, vista: URL.createObjectURL(archivo) }))];
    });
  }

  // Pegar con Ctrl+V en cualquier parte de la pantalla.
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

  function quitar(i: number) {
    setCapturas((prev) => {
      URL.revokeObjectURL(prev[i].vista);
      return prev.filter((_, j) => j !== i);
    });
  }

  function enviar() {
    if (titulo.trim().length < 3) {
      toast.error("Escriba un título corto: de qué se trata.");
      return;
    }
    if (!detalle.trim() && capturas.length === 0) {
      toast.error("Cuente un poco más en el detalle o pegue una captura.");
      return;
    }
    iniciar(async () => {
      const adjuntos: AdjuntoSugerencia[] = [];
      const storage = createClient().storage.from("adjuntos");
      for (const { archivo } of capturas) {
        const path = `sugerencias/${userId}/${crypto.randomUUID()}-${archivo.name.replace(/[^\w.\-]+/g, "_").slice(0, 80)}`;
        const { error } = await storage.upload(path, archivo, { contentType: archivo.type || "image/png" });
        if (error) {
          toast.error(`No se pudo subir «${archivo.name}». Intente de nuevo.`);
          return;
        }
        adjuntos.push({ path, nombre: archivo.name, tipo: archivo.type, tamano: archivo.size });
      }
      const r = await enviarSugerencia({ tipo, titulo, detalle, pantalla: pantalla || null, adjuntos });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("¡Gracias! Su sugerencia llegó al buzón.");
      capturas.forEach((c) => URL.revokeObjectURL(c.vista));
      setCapturas([]);
      setTitulo("");
      setDetalle("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">1 · ¿Qué quiere contarnos?</p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {TIPOS_SUGERENCIA.map((t) => (
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
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2 · Cuéntelo</p>
        <Input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          maxLength={140}
          placeholder="Título corto. Ej.: «El botón Cerrar del chat no se ve en el celular»"
        />
        <Textarea
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          rows={5}
          maxLength={5000}
          placeholder={"Qué estaba haciendo, qué esperaba que pasara y qué pasó.\nSi es una idea: cómo le ayudaría a vender o a atender mejor."}
        />
        {/* «¿En qué parte ocurre?» (Santos, 05-10: «Pantalla» no se entendía).
            Desde el CRM se llena sola con la pantalla de origen; solo se
            escribe si el comentario es de la web u otro proceso. */}
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">¿En qué parte ocurre?</span>
            <Input
              value={pantalla}
              onChange={(e) => setPantalla(e.target.value)}
              maxLength={300}
              placeholder="Ej.: web efameinsa.com, cotizador, almacén…"
              className="h-8 max-w-xs text-xs"
            />
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Si escribe desde una pantalla del CRM, se llena solo y no hace falta tocarlo. Si es sobre la web u otro
            proceso, escríbalo aquí.
          </p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">3 · Capturas de pantalla (opcional, hasta {MAX_CAPTURAS})</p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            agregar(Array.from(e.dataTransfer.files));
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
            arrastrando ? "border-[#8B1510] bg-[#8B1510]/[0.05]" : "border-border hover:border-[#8B1510]/50 hover:bg-secondary/40",
          )}
        >
          <ImagePlus className="size-6 text-[#8B1510]" />
          <p className="text-sm font-medium text-foreground">
            Pegue con <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[11px]">Ctrl</kbd> +{" "}
            <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[11px]">V</kbd>, arrastre aquí o haga clic para elegir
          </p>
          <p className="text-[11px] text-muted-foreground">
            Truco: <b>Windows + Shift + S</b> recorta un pedazo de la pantalla y después lo pega aquí.
          </p>
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
        {capturas.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {capturas.map((c, i) => (
              <div key={c.vista} className="group relative overflow-hidden rounded-md border border-border bg-secondary/40">
                {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
                <img src={c.vista} alt={c.archivo.name} className="aspect-video w-full object-cover" />
                <button
                  type="button"
                  onClick={() => quitar(i)}
                  className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-90 hover:bg-black/80"
                  aria-label={`Quitar ${c.archivo.name}`}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        <span className="text-[11px] leading-snug text-muted-foreground">
          Cada sugerencia suma <b className="text-foreground">3 puntos en Crece</b> (1 si es una duda; hasta 3 por día) y{" "}
          <b className="text-foreground">15 más</b> si se implementa. La respuesta le llega a la campana.
        </span>
        <Button onClick={enviar} disabled={enviando} className="gap-1.5">
          <Send className="size-4" /> {enviando ? "Enviando…" : "Enviar sugerencia"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta, galería y lista
// ---------------------------------------------------------------------------

function Galeria({ adjuntos }: { adjuntos: Sugerencia["adjuntos"] }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  const visibles = adjuntos.filter((a) => a.url);
  useEffect(() => {
    if (abierta === null) return;
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierta(null);
      if (e.key === "ArrowRight") setAbierta((i) => (i === null ? i : (i + 1) % visibles.length));
      if (e.key === "ArrowLeft") setAbierta((i) => (i === null ? i : (i - 1 + visibles.length) % visibles.length));
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierta, visibles.length]);
  if (!visibles.length) return null;
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {visibles.map((a, i) => (
          <button key={a.path} type="button" onClick={() => setAbierta(i)} className="overflow-hidden rounded-md border border-border hover:ring-2 hover:ring-[#8B1510]/50">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage */}
            <img src={a.url!} alt={a.nombre} className="h-20 w-32 object-cover" />
          </button>
        ))}
      </div>
      {abierta !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setAbierta(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage */}
          <img src={visibles[abierta].url!} alt={visibles[abierta].nombre} className="max-h-full max-w-full rounded-md shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button type="button" className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25" aria-label="Cerrar" onClick={() => setAbierta(null)}>
            <X className="size-5" />
          </button>
          {visibles.length > 1 && (
            <>
              <button type="button" className="absolute left-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25" aria-label="Anterior" onClick={(e) => { e.stopPropagation(); setAbierta((abierta - 1 + visibles.length) % visibles.length); }}>
                <ChevronLeft className="size-6" />
              </button>
              <button type="button" className="absolute right-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25" aria-label="Siguiente" onClick={(e) => { e.stopPropagation(); setAbierta((abierta + 1) % visibles.length); }}>
                <ChevronRight className="size-6" />
              </button>
              <span className="absolute bottom-4 rounded-full bg-white/15 px-3 py-1 text-xs text-white">{abierta + 1} / {visibles.length}</span>
            </>
          )}
        </div>
      )}
    </>
  );
}

function Estado({ estado }: { estado: EstadoSugerencia }) {
  const e = ESTADOS_SUGERENCIA.find((x) => x.valor === estado)!;
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", e.clase)}>{e.etiqueta}</span>;
}

function Tarjeta({ s, esAdmin, mostrarAutor, resaltada }: { s: Sugerencia; esAdmin: boolean; mostrarAutor: boolean; resaltada: boolean }) {
  const tipo = TIPOS_SUGERENCIA.find((t) => t.valor === s.tipo)!;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (resaltada) ref.current?.scrollIntoView({ block: "center" });
  }, [resaltada]);
  return (
    <div ref={ref} className={cn("rounded-lg border bg-card p-4", resaltada ? "border-[#8B1510] ring-1 ring-[#8B1510]" : "border-border")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            <span className="mr-1">{tipo.emoji}</span>
            {s.titulo}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {mostrarAutor && <b className="font-semibold text-foreground">{s.autor_nombre}{s.autor_codigo ? ` · ${s.autor_codigo}` : ""} · </b>}
            {tipo.etiqueta} · {fechaHoraLima(s.created_at)}
            {s.pantalla ? ` · ${s.pantalla}` : ""}
          </p>
        </div>
        <Estado estado={s.estado} />
      </div>
      {s.detalle && <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{s.detalle}</p>}
      <Galeria adjuntos={s.adjuntos} />
      {s.respuesta && !esAdmin && (
        <div className="mt-3 rounded-md border-l-4 border-[#8B1510] bg-[#8B1510]/[0.04] p-3">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-[#8B1510]">
            <MessageSquareReply className="size-3.5" /> Respuesta{s.respondida_por_nombre ? ` de ${s.respondida_por_nombre}` : ""}
            {s.respondida_at ? ` · ${fechaHoraLima(s.respondida_at)}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{s.respuesta}</p>
        </div>
      )}
      {esAdmin && <Atender s={s} />}
    </div>
  );
}

function Atender({ s }: { s: Sugerencia }) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoSugerencia>(s.estado);
  const [respuesta, setRespuesta] = useState(s.respuesta ?? "");
  const [guardando, iniciar] = useTransition();
  const cambio = estado !== s.estado || respuesta.trim() !== (s.respuesta ?? "");
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <div className="flex flex-wrap gap-1.5">
        {ESTADOS_SUGERENCIA.map((e) => (
          <button
            key={e.valor}
            type="button"
            onClick={() => setEstado(e.valor)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
              estado === e.valor ? "border-[#8B1510] bg-[#8B1510] text-white" : "border-border text-muted-foreground hover:border-[#8B1510]/50",
            )}
          >
            {e.etiqueta}
          </button>
        ))}
      </div>
      <Textarea value={respuesta} onChange={(e) => setRespuesta(e.target.value)} rows={2} placeholder="Respuesta para la persona (le llega a la campana). Opcional." />
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!cambio || guardando}
          onClick={() =>
            iniciar(async () => {
              const r = await atenderSugerencia({ id: s.id, estado, respuesta });
              if (r.error) toast.error(r.error);
              else {
                toast.success("Guardado");
                router.refresh();
              }
            })
          }
        >
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}

export function ListaSugerencias({
  sugerencias,
  esAdmin,
  verTodas,
  userId,
}: {
  sugerencias: Sugerencia[];
  esAdmin: boolean;
  /** Admin y gerencia ven las de todos, con el nombre de quien la dejó. */
  verTodas: boolean;
  userId: string;
}) {
  const params = useSearchParams();
  const ver = params.get("ver");
  const [filtro, setFiltro] = useState<EstadoSugerencia | "todas" | "mias">(verTodas ? "nueva" : "todas");
  const conteo = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of sugerencias) c[s.estado] = (c[s.estado] ?? 0) + 1;
    return c;
  }, [sugerencias]);
  const lista = sugerencias.filter((s) =>
    s.id === ver ? true : filtro === "todas" ? true : filtro === "mias" ? s.autor_id === userId : s.estado === filtro,
  );

  return (
    <div className="space-y-3">
      {verTodas && (
        <div className="flex flex-wrap gap-1.5">
          {([...ESTADOS_SUGERENCIA.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta })), { valor: "todas" as const, etiqueta: "Todas" }]).map((e) => (
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
              <span className="ml-1 tabular-nums opacity-80">{e.valor === "todas" ? sugerencias.length : (conteo[e.valor] ?? 0)}</span>
            </button>
          ))}
        </div>
      )}
      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {verTodas ? <Inbox className="size-6" /> : <Clock className="size-6" />}
          {verTodas
            ? "No hay sugerencias en este estado."
            : "Todavía no ha dejado sugerencias. Lo que escriba a la izquierda aparece aquí, con su respuesta."}
        </div>
      ) : (
        lista.map((s) => <Tarjeta key={s.id} s={s} esAdmin={esAdmin} mostrarAutor={verTodas} resaltada={s.id === ver} />)
      )}
    </div>
  );
}
