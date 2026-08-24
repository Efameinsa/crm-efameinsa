"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { crearCotizacion, editarCotizacion, type ItemCotizacion } from "@/lib/acciones/cotizaciones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fechaCalendario } from "@/lib/fechas";
import { buscarEquipos } from "@/lib/buscar-equipo";

interface PrecioTier {
  tier: string;
  precio: number;
}

interface Producto {
  id: string;
  sku: string | null;
  marca: string;
  modelo: string;
  nombre: string;
  capacidad: string | null;
  segmento: "industrial" | "semi_industrial";
  precios_producto: PrecioTier[];
  /** Cómo calienta (Gas GLP, ELÉCTRICA, Gas natural…). Vive en la ficha, no en
   *  el nombre, y es como la gente pide el equipo: "secadora eléctrica". */
  calentamiento?: string | null;
  /** El equipo no tiene datos técnicos cargados: su página de ficha saldría
   *  vacía en el PDF que recibe el cliente. */
  sinFicha?: boolean;
  sinFoto?: boolean;
}

interface ItemCarrito extends ItemCotizacion {
  nombre: string;
  precioPiso: number | null;
  sinFicha: boolean;
  /** Escrito a mano porque el equipo no está en el catálogo todavía. */
  fueraDeCatalogo?: boolean;
}

/** Un borrador que se está corrigiendo en vez de crear uno nuevo. */
export interface BorradorEnEdicion {
  cotizacionId: string;
  codigo: string | null;
  serie: "EFAMEINSA" | "OPEN";
  condiciones: string | null;
  vigenciaDias: number;
  items: {
    producto_id: string | null;
    descripcion: string | null;
    nombre: string;
    cantidad: number;
    precio_unitario: number;
    precioPiso: number | null;
  }[];
}

export interface HistorialPrecio {
  precio: number;
  fecha: string;
}

function precioTier(producto: Producto, tier: string): number | null {
  return producto.precios_producto.find((p) => p.tier === tier)?.precio ?? null;
}

function tierPiso(producto: Producto): string {
  return producto.segmento === "semi_industrial" ? "deseado" : "base";
}

function tierInicial(producto: Producto): string {
  return producto.segmento === "semi_industrial" ? "optimo" : "base";
}

function etiquetaEquipo(p: Producto): string {
  return `${p.sku ? `${p.sku} · ` : ""}${p.marca} ${p.modelo}${p.capacidad ? ` · ${p.capacidad}` : ""} — ${p.nombre}`;
}

// Un SOLO control para elegir equipo (corrección 24-08, ítems A3 y A4).
//
// ANTES eran dos: una caja "Buscar equipo" y, al lado, un <Select> con los 65
// equipos. Escribir en la caja solo filtraba la lista del Select —que está
// cerrado— así que desde fuera el buscador parecía muerto: Darwin tecleó "LG"
// y "Segmax 15" y no vio nada («no aparece ninguna opción o un
// autocompletador»). Y al elegir del Select salía el UUID del producto en vez
// del nombre, porque Radix pierde el texto del ítem cuando el filtro lo
// desmonta y cae al `value` crudo.
//
// Ahora es un autocompletador de verdad: se escribe y aparecen las
// coincidencias debajo, con teclado. El texto que se muestra lo controlamos
// nosotros, así que no hay UUID posible. Ojo con el dato: 5 de los 65 equipos
// activos no tienen código cargado (4 LG y 1 Primus) — buscar por código no
// los encuentra, hay que buscarlos por marca o modelo.
function BuscadorEquipo({
  productos,
  seleccionado,
  onSeleccionar,
}: {
  productos: Producto[];
  seleccionado: string;
  onSeleccionar: (id: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);

  const elegido = productos.find((p) => p.id === seleccionado) ?? null;

  // La búsqueda vive en lib/buscar-equipo.ts, con pruebas: es la pieza que
  // decide si el comercial encuentra lo que va a cotizar. El 24-08 Brenda buscó
  // «secadoras electricas primus semi industrial modelo fde y nde» y no salió
  // nada — se exigía que TODAS las palabras coincidieran, y ni «secadoras» en
  // plural ni «modelo» están en ningún equipo del catálogo.
  const coincidencias = useMemo(() => buscarEquipos(productos, texto), [productos, texto]);

  useEffect(() => {
    function fuera(e: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  function elegir(p: Producto) {
    onSeleccionar(p.id);
    setTexto(etiquetaEquipo(p));
    setAbierto(false);
  }

  return (
    <div ref={contenedor} className="relative flex-1">
      <Input
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setResaltado(0);
          setAbierto(true);
          // Si estaba elegido y se vuelve a escribir, deja de estarlo: así el
          // botón Agregar no mete un equipo distinto del que se ve escrito.
          if (seleccionado) onSeleccionar("");
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAbierto(true);
            setResaltado((i) => Math.min(i + 1, coincidencias.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setResaltado((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && abierto && coincidencias[resaltado]) {
            e.preventDefault();
            elegir(coincidencias[resaltado]);
          } else if (e.key === "Escape") {
            setAbierto(false);
          }
        }}
        placeholder="Buscar equipo por código, marca, modelo o capacidad…"
        aria-label="Buscar equipo"
        aria-expanded={abierto}
        role="combobox"
        aria-autocomplete="list"
      />
      {elegido && !abierto && (
        <p className="mt-1 text-[11px] text-muted-foreground">Elegido: {etiquetaEquipo(elegido)}</p>
      )}
      {abierto && (
        <ul className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
          {coincidencias.slice(0, 40).map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseEnter={() => setResaltado(i)}
                onClick={() => elegir(p)}
                className={cn(
                  "w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-sm",
                  i === resaltado ? "bg-accent text-accent-foreground" : "text-foreground",
                )}
              >
                {etiquetaEquipo(p)}
                {p.sinFicha && <span className="ml-1.5 text-[11px] font-semibold text-amber-700">· sin ficha técnica</span>}
              </button>
            </li>
          ))}
          {coincidencias.length === 0 && (
            <li className="px-2 py-2 text-xs text-muted-foreground">
              Ningún equipo coincide con “{texto.trim()}”. Pruebe por marca o modelo — 5 equipos no tienen código
              cargado.
            </li>
          )}
          {coincidencias.length > 40 && (
            <li className="px-2 py-1.5 text-[11px] text-muted-foreground">
              Mostrando 40 de {coincidencias.length} — siga escribiendo para acotar.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function Cotizador({
  oportunidadId,
  productos,
  historialPrecios = {},
  edicion,
}: {
  oportunidadId: string;
  productos: Producto[];
  historialPrecios?: Record<string, HistorialPrecio>;
  /** Cuando viene, el cotizador corrige ese borrador en vez de crear uno. */
  edicion?: BorradorEnEdicion;
}) {
  const router = useRouter();
  const [serie, setSerie] = useState<"EFAMEINSA" | "OPEN">(edicion?.serie ?? "EFAMEINSA");
  const [productoSeleccionado, setProductoSeleccionado] = useState("");
  const [carrito, setCarrito] = useState<ItemCarrito[]>(
    () =>
      edicion?.items.map((i) => ({
        producto_id: i.producto_id,
        descripcion: i.descripcion,
        nombre: i.nombre,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        precioPiso: i.precioPiso,
        sinFicha: false,
        fueraDeCatalogo: i.producto_id === null,
      })) ?? [],
  );
  // Sube en cada "Agregar" y hace de `key` del buscador: lo remonta limpio,
  // para que la caja no se quede con el equipo anterior escrito.
  const [vecesAgregado, setVecesAgregado] = useState(0);
  const [condiciones, setCondiciones] = useState(edicion?.condiciones ?? "Entrega: 15 días útiles. Garantía de fábrica.");
  const [vigenciaDias, setVigenciaDias] = useState(edicion?.vigenciaDias ?? 15);
  const [enviando, startTransition] = useTransition();

  function agregarProducto() {
    const producto = productos.find((p) => p.id === productoSeleccionado);
    if (!producto) return;
    const tierInicio = tierInicial(producto);
    const precio = precioTier(producto, tierInicio) ?? 0;
    setCarrito((c) => [
      ...c,
      {
        producto_id: producto.id,
        nombre: `${producto.marca} ${producto.modelo} — ${producto.nombre}`,
        cantidad: 1,
        precio_unitario: precio,
        tier_aplicado: tierInicio,
        precioPiso: precioTier(producto, tierPiso(producto)),
        sinFicha: Boolean(producto.sinFicha),
      },
    ]);
    setProductoSeleccionado("");
    setVecesAgregado((n) => n + 1);
  }

  function actualizarItem(i: number, cambios: Partial<ItemCarrito>) {
    setCarrito((c) => c.map((item, idx) => (idx === i ? { ...item, ...cambios } : item)));
  }

  function quitarItem(i: number) {
    setCarrito((c) => c.filter((_, idx) => idx !== i));
  }

  const total = carrito.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
  const hayBajoLista = carrito.some((i) => i.precioPiso !== null && i.precio_unitario < i.precioPiso);

  function confirmar() {
    if (carrito.length === 0) {
      toast.error("Agregue al menos un producto");
      return;
    }
    const items = carrito.map(({ producto_id, descripcion, cantidad, precio_unitario, tier_aplicado }) => ({
      producto_id,
      descripcion,
      cantidad,
      precio_unitario,
      tier_aplicado,
    }));

    startTransition(async () => {
      if (edicion) {
        const r = await editarCotizacion({
          cotizacionId: edicion.cotizacionId,
          items,
          condiciones,
          vigenciaDias,
        });
        if (r.error) {
          toast.error(r.error);
          return;
        }
        toast.success(
          hayBajoLista
            ? "Cotización corregida — queda pendiente de aprobación de gerencia (precio bajo lista)"
            : "Cotización corregida",
        );
        router.push(`/comercial/oportunidades/${oportunidadId}`);
        router.refresh();
        return;
      }

      const resultado = await crearCotizacion({ oportunidadId, serie, items, condiciones, vigenciaDias });
      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }
      toast.success(
        hayBajoLista
          ? "Cotización creada — queda pendiente de aprobación de gerencia (precio bajo lista)"
          : "Cotización creada y aprobada automáticamente",
      );
      setCarrito([]);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {edicion && (
        <p className="rounded-md border border-primary/30 bg-primary/5 p-2.5 text-xs text-foreground">
          Corrigiendo la cotización <b>{edicion.codigo ?? "en borrador"}</b>. Mantiene su número; al enviarla queda
          cerrada y ya no se podrá modificar.
        </p>
      )}
      <div className="flex gap-3">
        <Select value={serie} onValueChange={(v) => setSerie((v as typeof serie) ?? "EFAMEINSA")} disabled={Boolean(edicion)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EFAMEINSA">EFAMEINSA</SelectItem>
            <SelectItem value="OPEN">OPEN</SelectItem>
          </SelectContent>
        </Select>

        <BuscadorEquipo
          key={vecesAgregado}
          productos={productos}
          seleccionado={productoSeleccionado}
          onSeleccionar={setProductoSeleccionado}
        />
        <Button type="button" variant="outline" onClick={agregarProducto} disabled={!productoSeleccionado}>
          Agregar
        </Button>
      </div>

      {/* ⚠️ ACÁ ESTABA "agregar equipo a mano", quitado el 24-08 por decisión de
          Carlos en la reunión de las 14:17. El motivo NO es de interfaz, es
          contable: la contadora exige que cotización, orden de compra, guía,
          cierre, pedido y factura lleven todos el MISMO número y la misma
          descripción del producto, o rechaza el expediente. Si el comercial
          cotiza por fuera, el correlativo del sistema y el del documento que
          recibió el cliente dejan de coincidir y se rompe esa trazabilidad.
          «No hay que darle flexibilidad»; el producto que falte lo carga el
          ADMINISTRADOR —copiando la ficha de uno parecido y ajustándola— y
          recién ahí se cotiza. Mientras tanto la cotización se pausa y se pide
          la ficha a logística.
          La base sigue aceptando ítems con descripción libre (migración 0062):
          eso queda para la carga del administrador, no para el comercial. */}

      {carrito.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="w-20">Cant.</TableHead>
              <TableHead className="w-32">Precio unit. (US$)</TableHead>
              <TableHead className="w-28">Subtotal (US$)</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {carrito.map((item, i) => {
              const bajoLista = item.precioPiso !== null && item.precio_unitario < item.precioPiso;
              // Un equipo fuera de catálogo no tiene historial de precio a este
              // cliente: no existe como producto todavía.
              const historial = item.producto_id ? historialPrecios[item.producto_id] : undefined;
              const regalandoMargen = historial !== undefined && historial.precio > item.precio_unitario;
              return (
                <TableRow key={i}>
                  <TableCell>
                    {item.nombre}
                    {/* Sin esto el comercial se entera al abrir el PDF, con la
                        cotización ya hecha: la página de ficha técnica de ese
                        equipo sale en blanco delante del cliente. */}
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
                    {bajoLista && (
                      <p className="text-xs text-destructive">
                        Bajo lista (piso: US$ {item.precioPiso}) — requerirá aprobación de gerencia
                      </p>
                    )}
                    {historial && (
                      <p
                        className={cn(
                          "text-xs",
                          regalandoMargen ? "font-bold text-amber-700" : "text-muted-foreground",
                        )}
                      >
                        📌 Este cliente compró este equipo a US$ {historial.precio.toLocaleString("es-PE")} el{" "}
                        {fechaCalendario(historial.fecha)}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      value={item.cantidad}
                      onChange={(e) => actualizarItem(i, { cantidad: Number(e.target.value) || 1 })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.precio_unitario}
                      onChange={(e) =>
                        actualizarItem(i, { precio_unitario: Number(e.target.value) || 0, tier_aplicado: undefined })
                      }
                    />
                  </TableCell>
                  <TableCell className="tabular-nums">US$ {(item.cantidad * item.precio_unitario).toFixed(2)}</TableCell>
                  <TableCell>
                    <Button type="button" variant="ghost" size="sm" onClick={() => quitarItem(i)}>
                      Quitar
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <div className="space-y-2">
        <Label htmlFor="condiciones">Condiciones</Label>
        <Textarea id="condiciones" value={condiciones} onChange={(e) => setCondiciones(e.target.value)} rows={2} />
      </div>

      <div className="flex items-end gap-4">
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
        <p className="flex-1 text-right text-lg font-medium">Total: US$ {total.toFixed(2)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={confirmar} disabled={enviando || carrito.length === 0}>
          {enviando ? "Guardando…" : edicion ? "Guardar cambios" : "Crear cotización"}
        </Button>
        {edicion && (
          <Button type="button" variant="ghost" onClick={() => router.push(`/comercial/oportunidades/${oportunidadId}`)}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}
