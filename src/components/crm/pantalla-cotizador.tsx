"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  CloudOff,
  FileDown,
  ImageOff,
  Loader2,
  Phone,
  RotateCcw,
  TriangleAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  cambiarSerieBorrador,
  enviarCotizacion,
  finalizarCotizacion,
  guardarBorradorCotizacion,
} from "@/lib/acciones/cotizaciones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fechaCalendario } from "@/lib/fechas";
import { BuscadorEquiposModal } from "@/components/crm/buscador-equipos-modal";
import { CotizacionConfirmada } from "@/components/crm/cotizacion-confirmada";
import { ENTREGA_POR_DEFECTO, GARANTIA_POR_DEFECTO, GARANTIAS_FRECUENTES, IGV, LUGARES_ENTREGA } from "@/lib/pdf/series";
import type {
  BorradorEnEdicion,
  HistorialPrecio,
  ItemCarrito,
  ProductoCotizable,
} from "@/components/crm/tipos-cotizador";
import type { ContextoCotizador } from "@/lib/datos-cotizador";

/**
 * La pantalla de armar una cotización.
 *
 * POR QUÉ ES UNA PANTALLA Y NO UNA SECCIÓN (27-08). El cotizador vivía cuarto
 * en la columna izquierda de la ficha de oportunidad: con el historial cargado
 * arrancaba fuera de la vista, y la tabla de precios —donde se decide la
 * plata— quedaba comprimida en 600 px, mientras que ELEGIR el equipo ya tenía
 * una ventana de 1024 px con foto y ficha. Se invirtió el reparto: la ficha de
 * oportunidad es para leer al cliente, esta pantalla es para producir el
 * documento.
 *
 * SIEMPRE SE ESTÁ EDITANDO UN BORRADOR REAL. La fila nace en la base con el
 * primer equipo y se reescribe sola con cada cambio; no hay «guardar». Antes el
 * carrito vivía en la memoria del navegador y una llamada de teléfono se
 * llevaba seis equipos por delante. Un borrador no gasta correlativo —el número
 * se asigna al enviarlo (migración 0064)— así que crearlo temprano no
 * compromete nada con contabilidad.
 */

function precioTier(producto: ProductoCotizable, tier: string): number | null {
  return producto.precios_producto.find((p) => p.tier === tier)?.precio ?? null;
}

// El precio contra el que se mide si la cotización va rebajada. Espeja
// precio_referencia_producto() de la migración 0074: el piso pactado, y
// mientras gerencia no lo cargue, el mejor precio disponible.
function precioReferencia(producto: ProductoCotizable): number | null {
  for (const tier of ["deseado", "medio", "base", "optimo"]) {
    const p = precioTier(producto, tier);
    if (p !== null) return p;
  }
  return null;
}

function tierInicial(producto: ProductoCotizable): string {
  return producto.segmento === "semi_industrial" ? "optimo" : "base";
}

const monto = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// VACÍO a propósito desde el 28-08. Decía «Entrega: 15 días útiles. Garantía de
// fábrica.» y las dos cosas ya tienen su campo y su renglón impreso: dejarlas
// también acá hacía que el mismo documento prometiera dos entregas y dos
// garantías distintas. Este texto queda para la cláusula que NO entra en
// ninguno de los cuatro renglones —y la mayoría de las veces no hace falta
// ninguna.
const CONDICIONES_POR_DEFECTO = "";

// Las cuatro columnas de la tabla que cierra cada ficha del PDF (migración
// 0094). Se ofrecen ya escritas porque son las de casi todas las cotizaciones
// —salen de las que están cargadas en la base— y la comercial solo corrige
// cuando lo acordado con el cliente es otro. Vaciar una deja su celda en
// blanco, que es lo que pide el estándar para un dato todavía sin acordar.
const TIEMPO_ENTREGA_POR_DEFECTO = "Inmediata";
const FORMA_PAGO_POR_DEFECTO = "30 % con la O/C";
const SALDO_POR_DEFECTO = "70 % antes del despacho";

/** El sello de la barra superior: qué sabe la base de lo que hay en pantalla. */
type EstadoGuardado =
  | { tipo: "limpio"; hora?: string }
  | { tipo: "pendiente" }
  | { tipo: "guardando" }
  | { tipo: "error"; mensaje: string };

function SelloGuardado({ estado, onReintentar }: { estado: EstadoGuardado; onReintentar: () => void }) {
  if (estado.tipo === "error") {
    return (
      <button
        type="button"
        onClick={onReintentar}
        className="inline-flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive"
      >
        <CloudOff className="size-3.5" />
        No se pudo guardar — reintentar
      </button>
    );
  }
  if (estado.tipo === "guardando") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Guardando…
      </span>
    );
  }
  if (estado.tipo === "pendiente") {
    return <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">Cambios sin guardar…</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[#1E7F4F]">
      <Check className="size-3.5" />
      Guardado{estado.hora ? ` · ${estado.hora}` : ""}
    </span>
  );
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

export function PantallaCotizador({
  oportunidadId,
  cuenta,
  contacto,
  solicitud,
  productos,
  historialPrecios,
  edicion,
}: {
  oportunidadId: string;
  cuenta: ContextoCotizador["cuenta"];
  contacto: ContextoCotizador["contacto"];
  solicitud: string | null;
  productos: ProductoCotizable[];
  historialPrecios: Record<string, HistorialPrecio>;
  /** El borrador que se entró a corregir; sin esto la pantalla empieza vacía. */
  edicion?: BorradorEnEdicion;
}) {
  const router = useRouter();
  const volverHref = `/comercial/oportunidades/${oportunidadId}`;

  const [serie, setSerie] = useState<"EFAMEINSA" | "OPEN">(edicion?.serie ?? "EFAMEINSA");
  const [carrito, setCarrito] = useState<ItemCarrito[]>(
    () =>
      edicion?.items.map((i) => ({
        producto_id: i.producto_id,
        descripcion: i.descripcion,
        nombre: i.nombre,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        precioPiso: i.precioPiso,
        // Se resuelve contra el catálogo, no se asume `false`. Al reabrir un
        // borrador que ya traía un equipo sin ficha, el aviso desaparecía y el
        // comercial lo enviaba creyendo que estaba bien.
        sinFicha: Boolean(productos.find((p) => p.id === i.producto_id)?.sinFicha),
        fueraDeCatalogo: i.producto_id === null,
        color: i.color,
      })) ?? [],
  );
  const [condiciones, setCondiciones] = useState(edicion?.condiciones ?? CONDICIONES_POR_DEFECTO);
  const [vigenciaDias, setVigenciaDias] = useState(edicion?.vigenciaDias ?? 15);
  const [entregaLugar, setEntregaLugar] = useState<string>(edicion?.entregaLugar ?? ENTREGA_POR_DEFECTO);
  const [tiempoEntrega, setTiempoEntrega] = useState(edicion?.tiempoEntrega ?? TIEMPO_ENTREGA_POR_DEFECTO);
  const [garantia, setGarantia] = useState(edicion?.garantia ?? GARANTIA_POR_DEFECTO);
  const [formaPago, setFormaPago] = useState(edicion?.formaPago ?? FORMA_PAGO_POR_DEFECTO);
  const [saldo, setSaldo] = useState(edicion?.saldo ?? SALDO_POR_DEFECTO);

  const [cotizacionId, setCotizacionId] = useState<string | null>(edicion?.cotizacionId ?? null);
  // Lo que la BASE dice de la aprobación. Solo importa para un caso, pero es un
  // caso real: gerencia aprobó un descuento y el borrador se puede enviar
  // aunque sus precios sigan por debajo de la referencia. Cualquier cambio lo
  // vuelve a poner en juego — `editar_cotizacion` recalcula el estado.
  const [estadoAprobacion, setEstadoAprobacion] = useState(edicion?.estadoAprobacion ?? "auto_aprobada");
  const [guardado, setGuardado] = useState<EstadoGuardado>({ tipo: "limpio" });
  const [confirmando, setConfirmando] = useState(false);
  const [confirmada, setConfirmada] = useState<{ codigo: string | null } | null>(null);
  const [ocupado, startTransition] = useTransition();

  // Se decide UNA vez, al entrar, y no se vuelve a mirar. Si dependiera del
  // carrito en vivo —«ábrelo si está vacío»— bastaría que la pantalla se
  // volviera a montar después del primer equipo para que la ventana se cerrara
  // sola, que es el bug que reportó Darwin el 27-08. La causa de aquel montaje
  // ya está arreglada en `guardarBorradorCotizacion`; esto es para que, si algo
  // vuelve a provocarlo, no se lleve la ventana puesta.
  const [abrirBuscadorAlEntrar] = useState(() => !edicion && carrito.length === 0);

  // ── El catálogo, tal como lo consume el selector grande ──────────────────
  const equiposParaElegir = useMemo(
    () => productos.map((p) => ({ ...p, precio: precioReferencia(p) })),
    [productos],
  );
  const cantidadesEnCarrito = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of carrito) if (i.producto_id) m[i.producto_id] = (m[i.producto_id] ?? 0) + i.cantidad;
    return m;
  }, [carrito]);
  /** El color con el que cada equipo ya está en la cotización, para que el
   *  buscador muestre cuál está elegido y no solo cuál se está mirando. */
  const coloresEnCarrito = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of carrito) if (i.producto_id && i.color) m[i.producto_id] = i.color;
    return m;
  }, [carrito]);

  // ── Autoguardado ─────────────────────────────────────────────────────────
  // Lo que se le manda a la base, ya serializado: comparar esta cadena con la
  // última confirmada es lo que evita guardar cuando no cambió nada (abrir un
  // borrador y no tocarlo no debe escribir).
  const payload = useMemo(
    () =>
      JSON.stringify({
        items: carrito.map(({ producto_id, descripcion, cantidad, precio_unitario, tier_aplicado, color }) => ({
          producto_id,
          descripcion,
          cantidad,
          precio_unitario,
          tier_aplicado,
          color,
        })),
        condiciones,
        vigenciaDias,
        entregaLugar,
        // Las cuatro condiciones de la migración 0094 viajaban solo en la
        // pantalla: se escribían, se veían y al recargar habían desaparecido,
        // porque nunca entraron a este payload (que es lo único que se guarda).
        // Corregido el 28-08, al empezar a imprimirse la garantía.
        tiempoEntrega,
        garantia,
        formaPago,
        saldo,
      }),
    [carrito, condiciones, vigenciaDias, entregaLugar, tiempoEntrega, garantia, formaPago, saldo],
  );

  const payloadRef = useRef(payload);
  const guardadoRef = useRef(payload);
  const idRef = useRef<string | null>(edicion?.cotizacionId ?? null);
  // Los guardados van en fila india: dos llamadas a la vez, con el borrador
  // todavía sin id, crearían DOS cotizaciones.
  const cola = useRef<Promise<unknown>>(Promise.resolve());

  const guardarAhora = useCallback(async () => {
    const actual = payloadRef.current;
    if (actual === guardadoRef.current) return;

    setGuardado({ tipo: "guardando" });
    const datos = JSON.parse(actual) as {
      items: ItemCarrito[];
      condiciones: string;
      vigenciaDias: number;
      entregaLugar: string;
      tiempoEntrega: string;
      garantia: string;
      formaPago: string;
      saldo: string;
    };
    const r = await guardarBorradorCotizacion({
      cotizacionId: idRef.current,
      oportunidadId,
      serie,
      items: datos.items,
      condiciones: datos.condiciones,
      vigenciaDias: datos.vigenciaDias,
      entregaLugar: datos.entregaLugar,
      condicionesFicha: {
        tiempoEntrega: datos.tiempoEntrega,
        garantia: datos.garantia,
        formaPago: datos.formaPago,
        saldo: datos.saldo,
      },
    });

    if (r.error) {
      setGuardado({ tipo: "error", mensaje: r.error });
      return;
    }

    guardadoRef.current = actual;
    if (r.estadoAprobacion) setEstadoAprobacion(r.estadoAprobacion);
    // Quedarse sin equipos borra el borrador (no existe un documento vacío).
    // Se dice, porque es lo único que esta pantalla hace sin preguntar.
    if (idRef.current && !r.cotizacionId) {
      toast.info("Se quitó el último equipo: el borrador quedó vacío y se eliminó.");
    }
    if (r.cotizacionId !== idRef.current) {
      idRef.current = r.cotizacionId;
      setCotizacionId(r.cotizacionId);
      // La URL sigue al borrador sin recargar la pantalla: si se refresca o se
      // comparte el enlace, se cae dentro del mismo documento en vez de
      // empezar uno nuevo. Con router.replace la ruta cambiaría de verdad y el
      // componente se volvería a montar en mitad de la edición.
      window.history.replaceState(null, "", r.cotizacionId ? `${volverHref}/cotizar/${r.cotizacionId}` : `${volverHref}/cotizar`);
    }
    setGuardado({
      tipo: "limpio",
      hora: new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" }),
    });
  }, [oportunidadId, serie, volverHref]);

  const encolarGuardado = useCallback(() => {
    // El `catch` mantiene la cola viva: si un guardado se cae (la red del
    // almacén, típicamente) y la promesa quedara rechazada, ningún `.then`
    // posterior volvería a ejecutarse y el autoguardado moriría en silencio
    // para el resto de la sesión.
    cola.current = cola.current
      .then(guardarAhora)
      .catch((e) =>
        setGuardado({ tipo: "error", mensaje: e instanceof Error ? e.message : "No se pudo guardar" }),
      );
    return cola.current;
  }, [guardarAhora]);

  useEffect(() => {
    payloadRef.current = payload;
    if (payload === guardadoRef.current) return;
    setGuardado((g) => (g.tipo === "error" ? g : { tipo: "pendiente" }));
    // Medio segundo de calma: escribir un precio de cuatro dígitos es una sola
    // intención, no cuatro guardados.
    const t = setTimeout(() => void encolarGuardado(), 600);
    return () => clearTimeout(t);
  }, [payload, encolarGuardado]);

  // Antes de irse (o de enviar) se vacía lo que quede pendiente.
  const vaciarPendientes = useCallback(async () => {
    await encolarGuardado();
    return guardadoRef.current === payloadRef.current;
  }, [encolarGuardado]);

  // El navegador avisa si se cierra la pestaña con algo sin guardar. No
  // sustituye al autoguardado: lo cubre entre la tecla y los 600 ms.
  useEffect(() => {
    if (guardado.tipo === "limpio") return;
    const alSalir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [guardado.tipo]);

  // ── Equipos ──────────────────────────────────────────────────────────────
  // El clic en el selector AGREGA directo (pedido 25-08): elegir y después
  // apretar «Agregar» era confirmar dos veces lo mismo, porque el modal ya
  // muestra foto, precio, stock y avisos antes del clic.
  /**
   * `color` llega cuando el equipo se eligió por una de sus miniaturas de color
   * en el buscador (los coches de transporte). Sin color, el equipo se cotiza
   * como siempre y el PDF lista los colores disponibles.
   */
  function agregarProducto(producto: ProductoCotizable, color?: string) {
    const yaEsta = carrito.findIndex((i) => i.producto_id === producto.id);
    if (yaEsta >= 0) {
      setCarrito((c) =>
        c.map((item, idx) =>
          idx === yaEsta ? { ...item, cantidad: item.cantidad + 1, color: color ?? item.color } : item,
        ),
      );
      return;
    }
    const tierInicio = tierInicial(producto);
    setCarrito((c) => [
      ...c,
      {
        producto_id: producto.id,
        nombre: `${producto.marca} ${producto.modelo} — ${producto.nombre}`,
        cantidad: 1,
        precio_unitario: precioTier(producto, tierInicio) ?? 0,
        tier_aplicado: tierInicio,
        precioPiso: precioReferencia(producto),
        sinFicha: Boolean(producto.sinFicha),
        color: color ?? null,
      },
    ]);
  }

  /**
   * Clic en una miniatura de color del buscador. Si el equipo ya está en la
   * cotización le cambia el color —sin sumar otra unidad, que es lo que hace el
   * clic en la fila—; si no está, lo agrega ya con ese color.
   */
  function elegirColor(productoId: string, color: string) {
    const i = carrito.findIndex((item) => item.producto_id === productoId);
    if (i >= 0) {
      actualizarItem(i, { color });
      return;
    }
    const producto = productos.find((p) => p.id === productoId);
    if (producto) agregarProducto(producto, color);
  }

  function restarProducto(productoId: string) {
    setCarrito((c) =>
      c.map((i) => (i.producto_id === productoId ? { ...i, cantidad: i.cantidad - 1 } : i)).filter((i) => i.cantidad > 0),
    );
  }

  function quitarProducto(productoId: string) {
    setCarrito((c) => c.filter((i) => i.producto_id !== productoId));
  }

  function actualizarItem(i: number, cambios: Partial<ItemCarrito>) {
    setCarrito((c) => c.map((item, idx) => (idx === i ? { ...item, ...cambios } : item)));
  }

  function quitarItem(i: number) {
    setCarrito((c) => c.filter((_, idx) => idx !== i));
  }

  // ── Plata ────────────────────────────────────────────────────────────────
  const subtotal = carrito.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
  const igv = subtotal * IGV;

  // Gerencia decide UNA sola cosa: equipos por debajo del precio de referencia
  // (migración 0074). Ser industrial dejó de bastar — el ing. Carlos lo revirtió
  // el 25-08: «coticemos el precio de lista nada más; la función debería ser
  // cuando quieres reducir ese precio».
  const hayBajoLista = carrito.some((i) => i.precioPiso !== null && i.precio_unitario < i.precioPiso);
  // Un equipo sin NINGÚN precio cargado no se puede contrastar contra nada.
  const haySinPrecio = carrito.some((i) => i.producto_id !== null && i.precioPiso === null);
  // Un descuento que gerencia ya firmó no se vuelve a pedir.
  const yaAprobada = estadoAprobacion === "aprobada_gerencia";
  const iraAGerencia = (hayBajoLista || haySinPrecio) && !yaAprobada;
  const motivoAprobacion = [
    hayBajoLista && "precio por debajo de la referencia",
    haySinPrecio && "equipo sin precio cargado",
  ]
    .filter(Boolean)
    .join(" y ");
  const haySinFicha = carrito.some((i) => i.sinFicha || i.fueraDeCatalogo);

  // ── Salidas ──────────────────────────────────────────────────────────────
  function volver() {
    startTransition(async () => {
      await vaciarPendientes();
      router.push(volverHref);
      router.refresh();
    });
  }

  function alCambiarSerie(nueva: "EFAMEINSA" | "OPEN") {
    if (nueva === serie) return;
    // Sin borrador todavía, la serie es solo una elección en pantalla.
    if (!idRef.current) {
      setSerie(nueva);
      return;
    }
    startTransition(async () => {
      await vaciarPendientes();
      const r = await cambiarSerieBorrador({ cotizacionId: idRef.current!, serie: nueva });
      if (r.error && !r.cotizacionId) {
        toast.error(r.error);
        return;
      }
      if (r.error) toast.warning(r.error);
      if (r.cotizacionId) {
        idRef.current = r.cotizacionId;
        setCotizacionId(r.cotizacionId);
        window.history.replaceState(null, "", `${volverHref}/cotizar/${r.cotizacionId}`);
      }
      setSerie(nueva);
      toast.success(`El borrador pasó a la serie ${nueva}`);
    });
  }

  /** El botón grande: pide aprobación, o abre la confirmación de envío. */
  function accionPrincipal() {
    startTransition(async () => {
      const guardadoOk = await vaciarPendientes();
      if (!guardadoOk || !idRef.current) {
        toast.error("Todavía no se pudo guardar la cotización; revise la conexión antes de confirmarla.");
        return;
      }
      if (iraAGerencia) {
        const r = await finalizarCotizacion(idRef.current);
        if (r.error) {
          toast.error(r.error);
          return;
        }
        toast.success("Gerencia ya tiene su cotización para aprobar los precios.");
        router.push(volverHref);
        router.refresh();
        return;
      }
      setConfirmando(true);
    });
  }

  function confirmarCotizacion() {
    if (!idRef.current) return;
    startTransition(async () => {
      const r = await enviarCotizacion(idRef.current!);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setConfirmando(false);
      setConfirmada({ codigo: r.codigo ?? null });
      // Sin router.refresh(): `enviarCotizacion` ya revalidó `/comercial`, y
      // pedir otro refresco encima solo hace que el servidor vuelva a resolver
      // esta ruta. Da igual si igual ocurre — el servidor devuelve la misma
      // pantalla de confirmada— pero no hay para qué provocarlo.
    });
  }

  // ── Pantalla de «ya está confirmada» ─────────────────────────────────────
  // No devuelve a la oportunidad de golpe: lo siguiente que hace la comercial
  // es bajar el PDF para mandárselo al cliente, y hasta hoy eso obligaba a
  // buscar la fila recién creada en la lista.
  //
  // Y lo dice con todas las letras: EL CRM NO MANDA NADA. Confirmar le pone el
  // número y la cierra; el documento sale por correo o por WhatsApp, a mano,
  // como siempre. El botón decía «Enviar al cliente» y prometía algo que el
  // sistema no hace (corregido por Darwin el 27-08).
  // Es el MISMO panel que dibuja el servidor al abrir `/cotizar/<id>` de una
  // cotización ya confirmada. Que las dos vías terminen igual es lo que hace
  // que un refresco a destiempo deje de importar.
  if (confirmada && cotizacionId) {
    return (
      <CotizacionConfirmada
        cotizacionId={cotizacionId}
        codigo={confirmada.codigo}
        serie={serie}
        volverHref={volverHref}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Barra de contexto: con quién se está cotizando ──────────────── */}
      <div className="sticky top-0 z-20 -mx-6 -mt-6 border-b border-border bg-card/95 px-6 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="sm" onClick={volver} disabled={ocupado} className="flex-none">
              <ArrowLeft className="size-4" />
              Volver
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-foreground">
                {edicion ? `Corrigiendo ${edicion.codigo ?? "un borrador"}` : "Nueva cotización"}
                <span className="font-normal text-muted-foreground"> · {cuenta?.razonSocial ?? "Cuenta sin nombre"}</span>
              </h1>
              <p className="truncate text-[11px] text-muted-foreground">
                {cuenta?.tipoDoc !== "SIN_DOC" && cuenta?.numDoc ? `${cuenta.tipoDoc}: ${cuenta.numDoc}` : "Sin documento"}
                {contacto ? ` · ${contacto.nombre}${contacto.cargo ? ` (${contacto.cargo})` : ""}` : ""}
                {contacto?.telefono ? ` · ${contacto.telefono}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {contacto?.telefono && (
              <a
                href={`tel:${contacto.telefono.replace(/\s/g, "")}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Phone className="size-3.5" />
                Llamar
              </a>
            )}
            <SelloGuardado estado={guardado} onReintentar={() => void encolarGuardado()} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem] xl:grid-cols-[1fr_24rem]">
        {/* ── Equipos ───────────────────────────────────────────────────── */}
        <div className="space-y-3">
          {/* Lo que decidió gerencia sobre ESTE borrador, donde se corrige. La
              nota del rechazo vivía solo en la lista de la oportunidad: había
              que leerla en una pantalla y arreglar el precio en otra. */}
          {estadoAprobacion === "rechazada_gerencia" && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                <CircleAlert className="size-3.5" />
                Gerencia rechazó estos precios
              </p>
              {edicion?.notaGerencia && (
                <p className="mt-1 text-xs text-foreground">&ldquo;{edicion.notaGerencia}&rdquo;</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Corrija los precios y vuelva a pedir la aprobación.
              </p>
            </div>
          )}
          {yaAprobada && (
            <p className="flex items-center gap-1.5 rounded-lg border border-[#1E7F4F]/40 bg-[#1E7F4F]/5 p-3 text-xs font-medium text-[#1E7F4F]">
              <Check className="size-3.5" />
              Gerencia aprobó estos precios: ya se puede confirmar. Si cambia un precio, vuelve a hacer falta su
              visto bueno.
            </p>
          )}

          {/* Lo que pidió el prospecto, a la vista mientras se cotiza: se
              cotiza CONTRA esto y antes obligaba a volver a la oportunidad. */}
          {solicitud && (
            <details className="group rounded-lg border border-border bg-card px-4 py-2.5 text-sm">
              <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wide text-muted-foreground [&::-webkit-details-marker]:hidden">
                Lo que pidió el cliente <span className="text-primary group-open:hidden">▾</span>
                <span className="hidden text-primary group-open:inline">▴</span>
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{solicitud}</p>
            </details>
          )}

          <BuscadorEquiposModal
            productos={equiposParaElegir}
            enCarrito={cantidadesEnCarrito}
            coloresEnCarrito={coloresEnCarrito}
            onElegirColor={elegirColor}
            onAgregar={(e) => {
              const p = productos.find((x) => x.id === e.id);
              if (p) agregarProducto(p);
            }}
            onRestar={restarProducto}
            onQuitar={quitarProducto}
            abrirAlEntrar={abrirBuscadorAlEntrar}
          />

          {carrito.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
              <p className="text-sm font-medium text-foreground">Todavía no hay equipos en esta cotización.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Búsquelos por código, marca o como los pide el cliente («secadora a gas», «rodillo eléctrico»).
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {carrito.map((item, i) => {
                const producto = item.producto_id ? productos.find((p) => p.id === item.producto_id) : undefined;
                const bajoLista = item.precioPiso !== null && item.precio_unitario < item.precioPiso;
                const descuento =
                  bajoLista && item.precioPiso ? (1 - item.precio_unitario / item.precioPiso) * 100 : 0;
                // Un equipo fuera de catálogo no tiene historial de precio a
                // este cliente: no existe como producto todavía.
                const historial = item.producto_id ? historialPrecios[item.producto_id] : undefined;
                const regalandoMargen = historial !== undefined && historial.precio > item.precio_unitario;

                return (
                  <div
                    key={`${item.producto_id ?? "libre"}-${i}`}
                    className={cn(
                      "rounded-lg border bg-card p-3",
                      bajoLista ? "border-amber-500/40" : "border-border",
                    )}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      {/* La foto sigue al color elegido: es la que va a salir en
                          el PDF, así que se ve acá antes de mandarlo. */}
                      <Miniatura
                        fotoPath={(item.color && producto?.fotosPorColor?.[item.color]) || producto?.fotoPath}
                      />

                      <div className="min-w-[12rem] flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {producto?.sku && <span className="font-mono text-xs font-bold text-primary">{producto.sku} · </span>}
                          {item.nombre}
                        </p>
                        {producto?.capacidad && (
                          <p className="text-xs text-muted-foreground">{producto.capacidad}</p>
                        )}
                        {/* El color se elige en el buscador, pero se corrige acá
                            sin tener que sacar y volver a poner el equipo. */}
                        {(producto?.colores?.length ?? 0) > 0 && (
                          <label className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            Color
                            <select
                              className="cursor-pointer rounded-md border border-border bg-background px-1.5 py-0.5 text-xs font-medium text-foreground"
                              value={item.color ?? ""}
                              onChange={(e) => actualizarItem(i, { color: e.target.value || null })}
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
                      </div>

                      <div className="flex items-end gap-3">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Cantidad</Label>
                          <Input
                            type="number"
                            min={1}
                            className="w-20"
                            value={item.cantidad}
                            onChange={(e) => actualizarItem(i, { cantidad: Number(e.target.value) || 1 })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Precio unit. (US$)</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className={cn("w-32 tabular-nums", bajoLista && "border-amber-500 text-amber-800")}
                            value={item.precio_unitario}
                            onChange={(e) =>
                              actualizarItem(i, { precio_unitario: Number(e.target.value) || 0, tier_aplicado: undefined })
                            }
                          />
                        </div>
                        <div className="min-w-[7rem] space-y-1 text-right">
                          <Label className="text-[11px] text-muted-foreground">Subtotal</Label>
                          <p className="h-9 text-sm font-semibold tabular-nums leading-9 text-foreground">
                            US$ {monto(item.cantidad * item.precio_unitario)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => quitarItem(i)}
                          aria-label={`Quitar ${item.nombre}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Los avisos, todos juntos y debajo: son lo que decide si
                        esta línea se puede enviar hoy o espera a gerencia. */}
                    {(bajoLista || item.sinFicha || item.fueraDeCatalogo || historial) && (
                      <div className="mt-2 space-y-1 border-t border-border pt-2">
                        {/* EL AVISO CRECE CON EL DESCUENTO. Carlos lo pidió el
                            28-08 mirando el cotizador: «esto te pediría que lo
                            pongas que esté un poquito más de alerta, un poquito
                            más grande… el aviso cuando es muy bajo el precio».
                            Un 5% y un 44% no son la misma conversación: el
                            primero se autoriza solo, el segundo hay que ir a
                            defenderlo. Por eso el porcentaje va en grande y a
                            partir del 25% el aviso se pone rojo. */}
                        {bajoLista && item.precioPiso !== null && (
                          <div
                            className={cn(
                              "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border p-2",
                              descuento >= 25
                                ? "border-destructive/50 bg-destructive/10"
                                : "border-amber-400 bg-amber-50",
                            )}
                          >
                            <TriangleAlert
                              className={cn(
                                "flex-none",
                                descuento >= 25 ? "size-5 text-destructive" : "size-4 text-amber-700",
                              )}
                            />
                            <span
                              className={cn(
                                "font-bold tabular-nums",
                                descuento >= 25 ? "text-lg text-destructive" : "text-base text-amber-800",
                              )}
                            >
                              −{descuento.toFixed(1)}%
                            </span>
                            <span
                              className={cn(
                                "text-xs font-semibold",
                                descuento >= 25 ? "text-destructive" : "text-amber-900",
                              )}
                            >
                              por debajo de la referencia (US$ {monto(item.precioPiso)}) — requiere aprobación de
                              gerencia
                            </span>
                            <button
                              type="button"
                              onClick={() => actualizarItem(i, { precio_unitario: item.precioPiso! })}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                            >
                              <RotateCcw className="size-3" />
                              volver al precio de referencia
                            </button>
                          </div>
                        )}
                        {item.fueraDeCatalogo && (
                          <p className="text-xs font-semibold text-amber-700">
                            Fuera de catálogo — escrito a mano, sin ficha técnica en el PDF
                          </p>
                        )}
                        {!item.fueraDeCatalogo && item.sinFicha && (
                          <p className="text-xs font-semibold text-amber-700">
                            ⚠ Este equipo no tiene ficha técnica cargada — su página saldrá vacía en el PDF. Avise a
                            logística antes de enviarlo.
                          </p>
                        )}
                        {historial && (
                          <p className={cn("text-xs", regalandoMargen ? "font-bold text-amber-700" : "text-muted-foreground")}>
                            📌 Este cliente compró este equipo a US$ {historial.precio.toLocaleString("es-PE")} el{" "}
                            {fechaCalendario(historial.fecha)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ⚠️ ACÁ ESTABA "agregar equipo a mano", quitado el 24-08 por decisión
              de Carlos. El motivo NO es de interfaz, es contable: la contadora
              exige que cotización, orden de compra, guía, cierre, pedido y
              factura lleven el MISMO número y la misma descripción, o rechaza el
              expediente. El producto que falte lo carga el ADMINISTRADOR y
              recién ahí se cotiza. La base sigue aceptando ítems con descripción
              libre (migración 0062): eso es para esa carga, no para el
              comercial. */}
        </div>

        {/* ── Resumen: lo que va impreso y el botón que cierra ───────────── */}
        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="space-y-2">
              <Label htmlFor="serie">Serie</Label>
              <Select value={serie} onValueChange={(v) => alCambiarSerie((v as typeof serie) ?? "EFAMEINSA")} disabled={ocupado}>
                <SelectTrigger id="serie" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EFAMEINSA">EFAMEINSA</SelectItem>
                  <SelectItem value="OPEN">OPEN</SelectItem>
                </SelectContent>
              </Select>
              {cotizacionId && (
                <p className="text-[11px] text-muted-foreground">
                  Cambiar la serie rehace el borrador con los mismos equipos: el correlativo cuelga de ella.
                </p>
              )}
            </div>

            {/* Sale impreso como el punto 1 de "Importante". Hasta el 24-08 era
                un texto fijo; se elige por cotización porque lo acordado cambia
                con cada cliente (migración 0066). */}
            <div className="space-y-2">
              <Label htmlFor="entrega">Lugar de entrega</Label>
              <Select
                value={entregaLugar}
                onValueChange={(v) => setEntregaLugar(typeof v === "string" ? v : ENTREGA_POR_DEFECTO)}
              >
                <SelectTrigger id="entrega" className="w-full">
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
              {entregaLugar !== ENTREGA_POR_DEFECTO && (
                <p className="text-xs text-amber-700">
                  Está comprometiendo el traslado. Asegúrese de que el flete esté considerado en el precio.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vigencia">Vigencia (días)</Label>
              <Input
                id="vigencia"
                type="number"
                min={1}
                className="w-24"
                value={vigenciaDias}
                onChange={(e) => setVigenciaDias(Number(e.target.value) || 15)}
              />
            </div>

            {/* ── Lo acordado, los cuatro datos que van impresos ───────────
                Son las columnas de la tabla del estándar (migración 0094).
                Hasta el 28-08 se guardaban y NO salían en el PDF —la tabla que
                las llevaba al pie de cada ficha se había quitado el 27-08 por
                repetir el precio— y el comercial las llenaba para nada; lo que
                el cliente leía seguía siendo el párrafo de texto libre de más
                abajo, donde cada uno escribía la entrega y la garantía a su
                manera. Ahora cada una es un renglón rotulado de la última
                página, y por eso están acá arriba y juntas: se ven, se
                cambian y salen. Vaciar una la borra del documento, que es lo
                que pide el estándar para lo que todavía no se acordó. */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Condiciones comerciales</p>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="tiempo-entrega" className="text-xs font-normal text-muted-foreground">
                    Tiempo de entrega
                  </Label>
                  <Input id="tiempo-entrega" value={tiempoEntrega} onChange={(e) => setTiempoEntrega(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="garantia" className="text-xs font-normal text-muted-foreground">
                    Garantía
                  </Label>
                  <Input
                    id="garantia"
                    value={garantia}
                    onChange={(e) => setGarantia(e.target.value)}
                    placeholder="Sin garantía en el documento"
                  />
                  {/* Los plazos que se pactan de verdad, en un clic. El campo
                      sigue siendo libre: lo acordado no siempre es redondo. */}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {GARANTIAS_FRECUENTES.map((g) => (
                      <button
                        key={g}
                        type="button"
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
                    <Input id="forma-pago" value={formaPago} onChange={(e) => setFormaPago(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="saldo" className="text-xs font-normal text-muted-foreground">
                      Saldo
                    </Label>
                    <Input id="saldo" value={saldo} onChange={(e) => setSaldo(e.target.value)} />
                  </div>
                </div>
              </div>
              {/* Se muestra tal cual va a salir impreso. Es la única forma de
                  que se note lo que falta: un renglón vacío no se imprime y,
                  sin esta vista, nadie se entera hasta que el PDF ya está en
                  el correo del cliente. */}
              <div className="rounded-md border border-dashed border-border bg-secondary/40 px-2.5 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Sale impreso en la última página
                </p>
                {[
                  ["Tiempo de entrega", tiempoEntrega],
                  ["Garantía", garantia],
                  ["Forma de pago", formaPago],
                  ["Saldo", saldo],
                ].filter(([, v]) => v.trim()).length === 0 ? (
                  <p className="mt-1 text-[11px] text-amber-700">
                    Sin ninguna condición: el cliente no va a leer ni entrega ni garantía.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {[
                      ["Tiempo de entrega", tiempoEntrega],
                      ["Garantía", garantia],
                      ["Forma de pago", formaPago],
                      ["Saldo", saldo],
                    ]
                      .filter(([, v]) => v.trim())
                      .map(([rotulo, valor]) => (
                        <li key={rotulo} className="text-[11px] text-foreground">
                          <span className="font-semibold">{rotulo}:</span> {valor}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="condiciones">Otra cláusula</Label>
              <Textarea
                id="condiciones"
                value={condiciones}
                onChange={(e) => setCondiciones(e.target.value)}
                rows={3}
                placeholder="Solo si hay algo acordado que no entre en los cuatro renglones de arriba. Sale sobre ellos, en la última página."
              />
              {/* Los borradores viejos —y el que pegue el texto de otra
                  cotización— traen la entrega y la garantía metidas acá
                  dentro. Ahora que además se imprimen en su renglón, el mismo
                  documento diría dos veces la misma cosa, y a veces distinta:
                  «Entrega: 15 días útiles» arriba contra «Tiempo de entrega:
                  Inmediata» abajo. */}
              {(() => {
                const repetidos = [
                  garantia.trim() && /garant[íi]a/i.test(condiciones) ? "la garantía" : null,
                  tiempoEntrega.trim() && /entrega/i.test(condiciones) ? "la entrega" : null,
                  (formaPago.trim() || saldo.trim()) && /pago|saldo|adelanto/i.test(condiciones) ? "el pago" : null,
                ].filter(Boolean);
                if (repetidos.length === 0) return null;
                return (
                  <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
                    <TriangleAlert className="mt-px size-3.5 shrink-0" />
                    Este texto también menciona {repetidos.join(" y ")}, que ahora sale{repetidos.length > 1 ? "n" : ""} en
                    su propio renglón. Quítelo de acá para que el PDF no lo diga dos veces.
                  </p>
                );
              })()}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>
                  {carrito.length} {carrito.length === 1 ? "equipo" : "equipos"}
                </span>
                <span className="tabular-nums">US$ {monto(subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>IGV {(IGV * 100).toFixed(0)}%</span>
                <span className="tabular-nums">US$ {monto(igv)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 text-base font-bold text-foreground">
                <span>Total con IGV</span>
                <span className="tabular-nums">US$ {monto(subtotal + igv)}</span>
              </div>
            </div>

            {/* Se dice ANTES de cerrar, no después: si va a quedar esperando a
                gerencia, la comercial tiene que saberlo mientras todavía está
                armando la cotización. */}
            {carrito.length > 0 && iraAGerencia && (
              <p className="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-2 text-xs font-medium text-amber-800">
                <TriangleAlert className="mt-px size-3.5 shrink-0" />
                Va a quedar esperando la aprobación de gerencia ({motivoAprobacion}). No se puede confirmar hasta que la
                aprueben.
              </p>
            )}

            <Button className="w-full" onClick={accionPrincipal} disabled={ocupado || carrito.length === 0}>
              {ocupado ? "Un momento…" : iraAGerencia ? "Pedir aprobación a gerencia" : "Confirmar cotización"}
            </Button>
            {!iraAGerencia && carrito.length > 0 && (
              <p className="text-center text-[11px] text-muted-foreground">
                Le pone el número y la cierra. Mandársela al cliente es aparte, por correo o WhatsApp.
              </p>
            )}

            <div className="flex items-center justify-between gap-2 text-xs">
              {cotizacionId ? (
                <a
                  href={`/api/cotizaciones/${cotizacionId}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  <FileDown className="size-3.5" />
                  Ver el PDF del borrador
                </a>
              ) : (
                <span className="text-muted-foreground">El PDF se puede ver al agregar el primer equipo.</span>
              )}
              <button type="button" onClick={volver} disabled={ocupado} className="text-muted-foreground hover:underline">
                Seguir después
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* ── Confirmación ─────────────────────────────────────────────────── */}
      {/* Confirmar es lo único de esta pantalla que no tiene vuelta atrás:
          asigna el correlativo y congela el documento (migraciones 0064 y
          0062). Por eso es el único paso que pregunta. */}
      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Confirmar la cotización</DialogTitle>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Va a recibir su número de la serie <b className="text-foreground">{serie}</b> y desde ese momento el
              documento no se modifica: para cambiar algo habría que duplicarla.{" "}
              <b className="text-foreground">El CRM no se la manda al cliente</b>: eso lo hace usted por correo o
              WhatsApp con el PDF.
            </p>
            <dl className="space-y-1 rounded-md bg-secondary p-3 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Cliente</dt>
                <dd className="text-right font-medium text-foreground">{cuenta?.razonSocial ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Equipos</dt>
                <dd className="font-medium text-foreground">{carrito.reduce((a, i) => a + i.cantidad, 0)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Total con IGV</dt>
                <dd className="font-bold tabular-nums text-foreground">US$ {monto(subtotal + igv)}</dd>
              </div>
            </dl>
            {haySinFicha && (
              <p className="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-2 text-xs font-medium text-amber-800">
                <CircleAlert className="mt-px size-3.5 shrink-0" />
                Hay un equipo sin ficha técnica: esa página del PDF va a salir en blanco delante del cliente.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={ocupado}>
              Cancelar
            </Button>
            <Button onClick={confirmarCotizacion} disabled={ocupado}>
              {ocupado ? "Confirmando…" : "Confirmar y darle número"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
