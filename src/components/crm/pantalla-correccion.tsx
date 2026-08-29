"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileDown,
  ImageOff,
  KeyRound,
  Loader2,
  PencilLine,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { guardarCorreccion } from "@/lib/acciones/correccion-cotizacion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { BuscadorEquiposModal, ReemplazarEquipoModal } from "@/components/crm/buscador-equipos-modal";
import { GARANTIAS_FRECUENTES, IGV, LUGARES_ENTREGA } from "@/lib/pdf/series";
import type { BorradorEnEdicion, CorreccionAbierta, ItemCarrito, ProductoCotizable } from "@/components/crm/tipos-cotizador";
import type { ContextoCotizador } from "@/lib/datos-cotizador";

/**
 * Corregir una cotización que ya salió con su número.
 *
 * POR QUÉ EXISTE (ing. Carlos, 28-08): «no puedes variar el número, sobre todo
 * mucho ocurre con el banco, que es leasing, y tenemos varios leasing. Al banco
 * no le puedes dar otra numeración. Un número más, se demora un mes más en que
 * salga la operación.» Diseño completo en `docs/20`.
 *
 * ES UNA PANTALLA APARTE DEL COTIZADOR, y no un modo suyo, por una diferencia
 * que se nota en cada detalle: el cotizador AUTOGUARDA porque armar una
 * cotización lleva media hora y una llamada de teléfono no puede llevarse seis
 * equipos por delante. Acá se está reescribiendo un documento que el cliente ya
 * tiene: guardar es un acto, con su antes/después delante y su confirmación.
 * Meter las dos cosas en la misma pantalla habría dejado la de todos los días
 * llena de condicionales.
 *
 * LO QUE SÍ SE REUSA es lo que la comercial ya sabe usar: el mismo buscador de
 * equipos con foto y ficha, los mismos avisos de precio bajo lista, los mismos
 * cuatro renglones de condiciones. Una pantalla que se abre seis veces al año
 * no puede tener vocabulario propio.
 *
 * EL RELOJ DE ARRIBA no es adorno: la autorización dura media hora y sale de la
 * base (migración 0123). Si se venciera en silencio, el trabajo se perdería al
 * apretar guardar.
 */

const monto = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function precioTier(producto: ProductoCotizable, tier: string): number | null {
  return producto.precios_producto.find((p) => p.tier === tier)?.precio ?? null;
}

function precioReferencia(producto: ProductoCotizable): number | null {
  for (const tier of ["deseado", "medio", "base", "optimo"]) {
    const p = precioTier(producto, tier);
    if (p !== null) return p;
  }
  return null;
}

function Miniatura({ fotoPath }: { fotoPath: string | null | undefined }) {
  if (!fotoPath) {
    return (
      <span className="flex size-12 flex-none items-center justify-center rounded-md bg-secondary text-muted-foreground">
        <ImageOff className="size-4" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- foto local chica; next/image no aporta acá
    <img src={fotoPath} alt="" loading="lazy" className="size-12 flex-none rounded-md border border-border bg-white object-contain p-0.5" />
  );
}

/** Los minutos que le quedan a la autorización, contra el reloj del servidor. */
function useMinutosRestantes(expiraEn: string): number {
  const [restante, setRestante] = useState(() => Math.max(0, new Date(expiraEn).getTime() - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setRestante(Math.max(0, new Date(expiraEn).getTime() - Date.now())), 1000);
    return () => clearInterval(t);
  }, [expiraEn]);
  return Math.ceil(restante / 60000);
}

interface LineaCambio {
  rotulo: string;
  antes: string;
  despues: string;
}

export function PantallaCorreccion({
  oportunidadId,
  cuenta,
  productos,
  edicion,
  correccion,
}: {
  oportunidadId: string;
  cuenta: ContextoCotizador["cuenta"];
  productos: ProductoCotizable[];
  edicion: BorradorEnEdicion;
  correccion: CorreccionAbierta;
}) {
  const router = useRouter();
  const volverHref = `/comercial/oportunidades/${oportunidadId}`;
  const minutos = useMinutosRestantes(correccion.expiraEn);
  const vencida = minutos <= 0;

  const aItem = (i: BorradorEnEdicion["items"][number]): ItemCarrito => ({
    producto_id: i.producto_id,
    descripcion: i.descripcion,
    nombre: i.nombre,
    cantidad: i.cantidad,
    precio_unitario: i.precio_unitario,
    precioPiso: i.precioPiso,
    sinFicha: Boolean(productos.find((p) => p.id === i.producto_id)?.sinFicha),
    fueraDeCatalogo: i.producto_id === null,
    color: i.color,
  });

  // El documento tal como el cliente lo tiene HOY. Se congela al entrar: es
  // contra esto que se dice qué cambia, y no puede moverse mientras se corrige.
  const [original] = useState(() => ({
    items: edicion.items.map(aItem),
    condiciones: edicion.condiciones ?? "",
    vigenciaDias: edicion.vigenciaDias,
    entregaLugar: edicion.entregaLugar ?? "",
    tiempoEntrega: edicion.tiempoEntrega ?? "",
    garantia: edicion.garantia ?? "",
    formaPago: edicion.formaPago ?? "",
    saldo: edicion.saldo ?? "",
  }));

  const [carrito, setCarrito] = useState<ItemCarrito[]>(original.items);
  const [condiciones, setCondiciones] = useState(original.condiciones);
  const [vigenciaDias, setVigenciaDias] = useState(original.vigenciaDias);
  const [entregaLugar, setEntregaLugar] = useState(original.entregaLugar);
  const [tiempoEntrega, setTiempoEntrega] = useState(original.tiempoEntrega);
  const [garantia, setGarantia] = useState(original.garantia);
  const [formaPago, setFormaPago] = useState(original.formaPago);
  const [saldo, setSaldo] = useState(original.saldo);

  const [reemplazando, setReemplazando] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, empezar] = useTransition();
  const [abriendoPdf, setAbriendoPdf] = useState(false);

  const equiposParaElegir = useMemo(
    () => productos.map((p) => ({ ...p, precio: precioReferencia(p) })),
    [productos],
  );
  const cantidadesEnCarrito = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of carrito) if (i.producto_id) m[i.producto_id] = (m[i.producto_id] ?? 0) + i.cantidad;
    return m;
  }, [carrito]);

  const subtotal = carrito.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0);
  const totalAntes = original.items.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0);
  const totalConIgv = subtotal + subtotal * IGV;
  const totalAntesConIgv = totalAntes + totalAntes * IGV;

  function actualizar(i: number, cambios: Partial<ItemCarrito>) {
    setCarrito((c) => c.map((item, idx) => (idx === i ? { ...item, ...cambios } : item)));
  }

  /**
   * Reemplazar el equipo de una línea. La CANTIDAD y el PRECIO se conservan:
   * lo que se está corrigiendo es qué equipo se le ofreció al cliente, no lo
   * que se le cobró. Si el equipo nuevo tiene otro precio de lista, se avisa
   * en la propia línea y la comercial decide.
   */
  function reemplazar(i: number, nuevo: ProductoCotizable) {
    actualizar(i, {
      producto_id: nuevo.id,
      nombre: `${nuevo.marca} ${nuevo.modelo} — ${nuevo.nombre}`,
      descripcion: null,
      precioPiso: precioReferencia(nuevo),
      sinFicha: Boolean(nuevo.sinFicha),
      fueraDeCatalogo: false,
      // El color del equipo viejo no vale para otro equipo: se limpia salvo
      // que el nuevo también lo tenga.
      color: nuevo.colores?.includes(carrito[i]?.color ?? "") ? carrito[i].color : null,
    });
  }

  function agregar(p: ProductoCotizable) {
    if (carrito.some((i) => i.producto_id === p.id)) return;
    setCarrito((c) => [
      ...c,
      {
        producto_id: p.id,
        nombre: `${p.marca} ${p.modelo} — ${p.nombre}`,
        cantidad: 1,
        precio_unitario: precioReferencia(p) ?? 0,
        precioPiso: precioReferencia(p),
        sinFicha: Boolean(p.sinFicha),
        color: null,
      },
    ]);
  }

  // ── Qué cambia, dicho como lo va a leer quien autorizó ───────────────────
  const cambios: LineaCambio[] = useMemo(() => {
    const lista: LineaCambio[] = [];
    const largo = Math.max(original.items.length, carrito.length);
    for (let i = 0; i < largo; i++) {
      const a = original.items[i];
      const b = carrito[i];
      const rotulo = `Línea ${i + 1}`;
      if (a && !b) {
        lista.push({ rotulo, antes: a.nombre, despues: "se quita del documento" });
        continue;
      }
      if (!a && b) {
        lista.push({ rotulo, antes: "no estaba", despues: b.nombre });
        continue;
      }
      if (!a || !b) continue;
      if (a.producto_id !== b.producto_id || a.nombre !== b.nombre) {
        lista.push({ rotulo, antes: a.nombre, despues: b.nombre });
      }
      if (a.cantidad !== b.cantidad) {
        lista.push({ rotulo: `${rotulo} · cantidad`, antes: String(a.cantidad), despues: String(b.cantidad) });
      }
      if (a.precio_unitario !== b.precio_unitario) {
        lista.push({
          rotulo: `${rotulo} · precio`,
          antes: `US$ ${monto(a.precio_unitario)}`,
          despues: `US$ ${monto(b.precio_unitario)}`,
        });
      }
      if ((a.color ?? "") !== (b.color ?? "")) {
        lista.push({ rotulo: `${rotulo} · color`, antes: a.color ?? "sin elegir", despues: b.color ?? "sin elegir" });
      }
    }
    const textos: [string, string, string][] = [
      ["Tiempo de entrega", original.tiempoEntrega, tiempoEntrega],
      ["Garantía", original.garantia, garantia],
      ["Forma de pago", original.formaPago, formaPago],
      ["Saldo", original.saldo, saldo],
      ["Lugar de entrega", original.entregaLugar, entregaLugar],
      ["Otra cláusula", original.condiciones, condiciones],
    ];
    for (const [rotulo, antes, despues] of textos) {
      if (antes.trim() !== despues.trim()) {
        lista.push({ rotulo, antes: antes.trim() || "vacío", despues: despues.trim() || "vacío" });
      }
    }
    if (original.vigenciaDias !== vigenciaDias) {
      lista.push({ rotulo: "Vigencia", antes: `${original.vigenciaDias} días`, despues: `${vigenciaDias} días` });
    }
    if (Math.abs(totalAntes - subtotal) > 0.004) {
      lista.push({
        rotulo: "Total con IGV",
        antes: `US$ ${monto(totalAntesConIgv)}`,
        despues: `US$ ${monto(totalConIgv)}`,
      });
    }
    return lista;
  }, [
    original,
    carrito,
    condiciones,
    vigenciaDias,
    entregaLugar,
    tiempoEntrega,
    garantia,
    formaPago,
    saldo,
    subtotal,
    totalAntes,
    totalAntesConIgv,
    totalConIgv,
  ]);

  const mueveLaPlata = Math.abs(totalAntes - subtotal) > 0.004;
  const bajoLista = carrito.some((i) => i.precioPiso !== null && i.precio_unitario < i.precioPiso);

  function cuerpoParaGuardar() {
    return {
      cotizacionId: edicion.cotizacionId,
      items: carrito.map(({ producto_id, descripcion, cantidad, precio_unitario, color }) => ({
        producto_id,
        descripcion,
        cantidad,
        precio_unitario,
        color,
      })),
      condiciones,
      vigenciaDias,
      entregaLugar: entregaLugar || null,
      tiempoEntrega,
      garantia,
      formaPago,
      saldo,
    };
  }

  /**
   * El PDF con la corrección puesta, sin guardarla todavía.
   *
   * Es el control que de verdad sirve: cambiar el equipo cambia la página
   * entera de la ficha técnica. Y tiene que poder mirarse ANTES, porque
   * guardar quema la autorización — descubrir la errata después costaría otra
   * llamada a operaciones.
   */
  async function verPdf() {
    setAbriendoPdf(true);
    try {
      const datos = cuerpoParaGuardar();
      const r = await fetch(`/api/cotizaciones/${edicion.cotizacionId}/pdf/vista-previa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: datos.items,
          condiciones: datos.condiciones || null,
          vigencia_dias: datos.vigenciaDias,
          entrega_lugar: datos.entregaLugar,
          tiempo_entrega: datos.tiempoEntrega,
          garantia: datos.garantia,
          forma_pago: datos.formaPago,
          saldo: datos.saldo,
        }),
      });
      if (!r.ok) {
        toast.error("No se pudo armar la vista previa del PDF.");
        return;
      }
      const url = URL.createObjectURL(await r.blob());
      window.open(url, "_blank", "noopener");
      // Se suelta después de que el navegador lo abrió; revocarlo al instante
      // deja la pestaña en blanco.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setAbriendoPdf(false);
    }
  }

  function guardar() {
    empezar(async () => {
      const r = await guardarCorreccion(cuerpoParaGuardar());
      if (r.error) {
        toast.error(r.error);
        setConfirmando(false);
        return;
      }
      toast.success(`${r.codigo ?? "La cotización"} quedó corregida, con el mismo número.`);
      setConfirmando(false);
      router.push(`${volverHref}/cotizar/${edicion.cotizacionId}`);
      router.refresh();
    });
  }

  const enReemplazo = reemplazando !== null ? carrito[reemplazando] : null;
  const productoEnReemplazo = enReemplazo?.producto_id
    ? productos.find((p) => p.id === enReemplazo.producto_id)
    : undefined;

  return (
    <div className="space-y-4">
      {/* ── La franja que dice dónde está uno ──────────────────────────────
          Granate y con el número enorme: en esta pantalla el número es lo
          único que NO se puede tocar, y es la razón de que exista. */}
      <div className="sticky top-0 z-20 -mx-6 -mt-6 border-b-2 border-primary bg-primary/5 px-6 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`${volverHref}/cotizar/${edicion.cotizacionId}`)}
              disabled={ocupado}
              className="flex-none"
            >
              <ArrowLeft className="size-4" />
              Salir
            </Button>
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold text-primary">
                <PencilLine className="size-4" />
                Corrigiendo la cotización {edicion.codigo ?? ""} · {edicion.serie === "OPEN" ? "Open" : "Efameinsa"}
                {(edicion.version ?? 1) > 1 && (
                  <span className="font-normal text-muted-foreground">(ya se corrigió {(edicion.version ?? 1) - 1}×)</span>
                )}
              </h1>
              <p className="truncate text-[11px] text-muted-foreground">
                El número, el cliente y la fecha no cambian · {cuenta?.razonSocial ?? "Cuenta sin nombre"}
              </p>
            </div>
          </div>
          <span
            className={cn(
              "flex flex-none items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
              vencida ? "border-destructive bg-destructive/10 text-destructive" : "border-primary text-primary",
            )}
          >
            <KeyRound className="size-3.5" />
            {vencida ? "la autorización venció" : `autorizó ${correccion.autorizo} · quedan ${minutos} min`}
          </span>
        </div>
      </div>

      {vencida && (
        <div className="rounded-lg border-2 border-destructive/50 bg-destructive/5 p-3">
          <p className="text-sm font-semibold text-destructive">La autorización se venció.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Lo que escribió sigue en pantalla, pero ya no se puede guardar. Salga, vuelva a pedir el código a
            operaciones o gerencia, y entre de nuevo.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem] xl:grid-cols-[1fr_24rem]">
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-secondary/40 px-4 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Lo que usted escribió al pedir la autorización
            </p>
            <p className="mt-1 text-sm text-foreground">&ldquo;{correccion.motivo}&rdquo;</p>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Los equipos — clic en uno para cambiarlo
            </p>
            <div className="space-y-2">
              {carrito.map((item, i) => {
                const producto = item.producto_id ? productos.find((p) => p.id === item.producto_id) : undefined;
                const cambiado = original.items[i]?.producto_id !== item.producto_id;
                const bajo = item.precioPiso !== null && item.precio_unitario < item.precioPiso;
                return (
                  <div
                    key={`linea-${i}`}
                    className={cn(
                      "rounded-lg border bg-card",
                      cambiado ? "border-primary/60 ring-2 ring-primary/10" : "border-border",
                      bajo && "border-amber-500/60",
                    )}
                  >
                    {/* La línea entera es el botón que abre el buscador: es el
                        gesto de esta pantalla. Los campos de cantidad y precio
                        van FUERA del botón —un control dentro de otro se come
                        el clic— y por eso el botón ocupa solo la parte de
                        arriba, la que nombra el equipo. */}
                    <button
                      type="button"
                      onClick={() => setReemplazando(i)}
                      disabled={vencida}
                      className="group flex w-full items-center gap-3 rounded-t-lg p-3 text-left transition-colors hover:bg-primary/5 disabled:cursor-not-allowed"
                    >
                      <Miniatura fotoPath={(item.color && producto?.fotosPorColor?.[item.color]) || producto?.fotoPath} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">
                          {producto?.sku && <span className="font-mono text-xs font-bold text-primary">{producto.sku} · </span>}
                          {item.nombre}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {producto?.capacidad ? `${producto.capacidad} · ` : ""}
                          línea {i + 1}
                          {cambiado && <span className="ml-1 font-semibold text-primary">· cambiado</span>}
                        </span>
                      </span>
                      <span className="flex-none rounded-full border border-primary/40 px-2.5 py-1 text-xs font-semibold text-primary opacity-60 transition-opacity group-hover:opacity-100">
                        cambiar equipo
                      </span>
                    </button>

                    <div className="flex flex-wrap items-end gap-3 border-t border-border px-3 py-2">
                      {(producto?.colores?.length ?? 0) > 0 && (
                        <label className="space-y-1 text-xs text-muted-foreground">
                          <span className="block text-[11px]">Color</span>
                          <select
                            disabled={vencida}
                            className="h-9 cursor-pointer rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground"
                            value={item.color ?? ""}
                            onChange={(e) => actualizar(i, { color: e.target.value || null })}
                          >
                            <option value="">Todos los disponibles</option>
                            {producto!.colores!.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Cantidad</Label>
                        <Input
                          type="number"
                          min={1}
                          disabled={vencida}
                          className="w-20"
                          value={item.cantidad}
                          onChange={(e) => actualizar(i, { cantidad: Number(e.target.value) || 1 })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Precio unit. (US$)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          disabled={vencida}
                          className={cn("w-32 tabular-nums", bajo && "border-amber-500 text-amber-800")}
                          value={item.precio_unitario}
                          onChange={(e) => actualizar(i, { precio_unitario: Number(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="min-w-[7rem] flex-1 space-y-1 text-right">
                        <Label className="text-[11px] text-muted-foreground">Subtotal</Label>
                        <p className="h-9 text-sm font-semibold leading-9 tabular-nums text-foreground">
                          US$ {monto(item.cantidad * item.precio_unitario)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={vencida || carrito.length === 1}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setCarrito((c) => c.filter((_, idx) => idx !== i))}
                        aria-label={`Quitar ${item.nombre}`}
                        title={carrito.length === 1 ? "La cotización necesita al menos un equipo" : "Quitar del documento"}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    {/* Un precio bajo lista NO se puede dejar por esta puerta:
                        la base lo rechaza (migración 0123). Se avisa acá para
                        que no se descubra al apretar guardar. */}
                    {bajo && item.precioPiso !== null && (
                      <p className="flex items-start gap-1.5 border-t border-amber-400 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                        <TriangleAlert className="mt-px size-3.5 flex-none" />
                        Por debajo del precio de lista (US$ {monto(item.precioPiso)}). Una corrección no aprueba
                        descuentos: ese precio lo tiene que autorizar gerencia antes de emitir.
                      </p>
                    )}
                    {item.sinFicha && (
                      <p className="border-t border-border px-3 py-2 text-xs font-semibold text-amber-700">
                        ⚠ Este equipo no tiene ficha técnica cargada: su página saldrá vacía en el PDF.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agregar una línea que faltaba. En segundo plano: lo que se viene a
              hacer acá es cambiar un equipo, no armar una cotización nueva. */}
          {!vencida && (
            <BuscadorEquiposModal
              productos={equiposParaElegir}
              enCarrito={cantidadesEnCarrito}
              onAgregar={(e) => {
                const p = productos.find((x) => x.id === e.id);
                if (p) agregar(p);
              }}
              onRestar={(id) =>
                setCarrito((c) =>
                  c.map((i) => (i.producto_id === id ? { ...i, cantidad: i.cantidad - 1 } : i)).filter((i) => i.cantidad > 0),
                )
              }
              onQuitar={(id) => setCarrito((c) => c.filter((i) => i.producto_id !== id))}
            />
          )}
        </div>

        {/* ── Lo impreso y lo que cambia ─────────────────────────────────── */}
        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-sm font-medium">Lo que sale impreso</p>
            <div className="space-y-2">
              <Label htmlFor="entrega" className="text-xs font-normal text-muted-foreground">
                Lugar de entrega
              </Label>
              <Select value={entregaLugar} onValueChange={(v) => setEntregaLugar(typeof v === "string" ? v : entregaLugar)}>
                <SelectTrigger id="entrega" className="w-full" disabled={vencida}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LUGARES_ENTREGA.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tiempo-entrega" className="text-xs font-normal text-muted-foreground">
                Tiempo de entrega
              </Label>
              <Input id="tiempo-entrega" disabled={vencida} value={tiempoEntrega} onChange={(e) => setTiempoEntrega(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="garantia" className="text-xs font-normal text-muted-foreground">
                Garantía
              </Label>
              <Input id="garantia" disabled={vencida} value={garantia} onChange={(e) => setGarantia(e.target.value)} />
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {GARANTIAS_FRECUENTES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    disabled={vencida}
                    onClick={() => setGarantia(g)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      garantia.trim().toLowerCase() === g.toLowerCase()
                        ? "border-primary bg-primary/10 font-semibold text-primary"
                        : "border-border text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="forma-pago" className="text-xs font-normal text-muted-foreground">
                  Forma de pago
                </Label>
                <Input id="forma-pago" disabled={vencida} value={formaPago} onChange={(e) => setFormaPago(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="saldo" className="text-xs font-normal text-muted-foreground">
                  Saldo
                </Label>
                <Input id="saldo" disabled={vencida} value={saldo} onChange={(e) => setSaldo(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="vigencia" className="text-xs font-normal text-muted-foreground">
                Vigencia (días)
              </Label>
              <Input
                id="vigencia"
                type="number"
                min={1}
                disabled={vencida}
                className="w-24"
                value={vigenciaDias}
                onChange={(e) => setVigenciaDias(Number(e.target.value) || 15)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="condiciones" className="text-xs font-normal text-muted-foreground">
                Otra cláusula
              </Label>
              <Textarea id="condiciones" disabled={vencida} rows={2} value={condiciones} onChange={(e) => setCondiciones(e.target.value)} />
            </div>
          </div>

          {/* ── Qué cambia ─────────────────────────────────────────────────
              Es el corazón de la revisión: lo mismo que va a leer quien dio la
              autorización, en las mismas palabras. */}
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <p className="border-b border-border bg-secondary/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Qué cambia en {edicion.codigo ?? "esta cotización"}
            </p>
            {cambios.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">
                Todavía no cambió nada. Toque un equipo para cambiarlo por el correcto.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {cambios.map((c, i) => (
                  <li key={i} className="px-3 py-2 text-xs">
                    <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{c.rotulo}</p>
                    <p className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
                      <span className="text-muted-foreground line-through">{c.antes}</span>
                      <ArrowRight className="size-3 flex-none text-primary" />
                      <span className="font-semibold text-foreground">{c.despues}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total con IGV</span>
              <span className="font-bold tabular-nums text-foreground">US$ {monto(totalConIgv)}</span>
            </div>
            <Button variant="outline" className="w-full" onClick={verPdf} disabled={abriendoPdf || carrito.length === 0}>
              {abriendoPdf ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
              Ver el PDF corregido
            </Button>
            <Button
              className="w-full"
              onClick={() => setConfirmando(true)}
              disabled={ocupado || vencida || cambios.length === 0 || bajoLista}
            >
              Guardar la corrección
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              El documento conserva su número. La versión de hoy queda archivada entera.
            </p>
          </div>
        </aside>
      </div>

      {/* ── El buscador en modo reemplazar ──────────────────────────────── */}
      {enReemplazo && (
        <ReemplazarEquipoModal
          // Una instancia por línea: así el buscador arranca escrito con el
          // modelo de ESA línea y no con el de la anterior.
          key={reemplazando}
          abierto={reemplazando !== null}
          linea={(reemplazando ?? 0) + 1}
          actual={{
            id: enReemplazo.producto_id,
            nombre: enReemplazo.nombre,
            sku: productoEnReemplazo?.sku ?? null,
            modelo: productoEnReemplazo?.modelo ?? null,
          }}
          productos={equiposParaElegir}
          onReemplazar={(e) => {
            const p = productos.find((x) => x.id === e.id);
            if (p && reemplazando !== null) reemplazar(reemplazando, p);
          }}
          onCerrar={() => setReemplazando(null)}
        />
      )}

      {/* ── Confirmar ───────────────────────────────────────────────────── */}
      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Guardar la corrección de {edicion.codigo ?? "la cotización"}</DialogTitle>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              El documento se reescribe con <b className="text-foreground">el mismo número</b> y la versión de hoy queda
              archivada. <b className="text-foreground">Mandarle el PDF corregido al cliente es aparte</b>, por correo o
              WhatsApp — el CRM no manda nada.
            </p>
            {/* Un equipo cambiado es un error corregido; un total cambiado es
                un compromiso distinto con el cliente. Por eso se dice con el
                número delante y no en letra chica. */}
            {mueveLaPlata && (
              <div className="rounded-md border-2 border-amber-400 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">El total cambia</p>
                <p className="mt-1 flex flex-wrap items-baseline gap-1.5 text-sm text-amber-900">
                  <span className="line-through opacity-70">US$ {monto(totalAntesConIgv)}</span>
                  <ArrowRight className="size-3.5" />
                  <b className="tabular-nums">US$ {monto(totalConIgv)}</b>
                </p>
                <p className="mt-1 text-xs text-amber-900/80">
                  Es lo que va a leer el cliente —y el banco— en el mismo número que ya recibió.
                </p>
              </div>
            )}
            <dl className="space-y-1 rounded-md bg-secondary p-3 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Cliente</dt>
                <dd className="text-right font-medium text-foreground">{cuenta?.razonSocial ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Cambios</dt>
                <dd className="font-medium text-foreground">{cambios.length}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Autorizó</dt>
                <dd className="font-medium text-foreground">{correccion.autorizo}</dd>
              </div>
            </dl>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={ocupado}>
              Seguir corrigiendo
            </Button>
            <Button onClick={guardar} disabled={ocupado}>
              {ocupado ? "Guardando…" : <><Check className="size-4" />Guardar con el mismo número</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
