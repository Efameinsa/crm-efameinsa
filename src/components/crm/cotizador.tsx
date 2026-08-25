"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { TriangleAlert } from "lucide-react";
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
import { BuscadorEquiposModal } from "@/components/crm/buscador-equipos-modal";
import { ENTREGA_POR_DEFECTO, LUGARES_ENTREGA } from "@/lib/pdf/series";

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
  panel?: string | null;
  controles?: string | null;
  /** Ruta pública de la foto ("/productos/x.png"), para la vista previa. */
  fotoPath?: string | null;
  /** La ficha completa, títulos de bloque incluidos: el selector la muestra
   *  entera (reunión con gerencia 25-08). */
  caracteristicas?: string[];
  nDimensiones?: number;
  /** El equipo no tiene datos técnicos cargados: su página de ficha saldría
   *  vacía en el PDF que recibe el cliente. */
  sinFicha?: boolean;
  sinFoto?: boolean;
  /** SKU del equipo hermano cuya foto se está mostrando. Pasa cuando el Word
   *  de este equipo trae un pantallazo en vez de una foto de producto. */
  fotoPrestadaDe?: string | null;
  /** Unidades según la columna STOCK del Excel de Lesly. null = sin dato. */
  stock?: number | null;
  /** Descripción del maestro de Lesly: solo alimenta la búsqueda del selector. */
  descripcion?: string | null;
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
  entregaLugar: string | null;
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

// El precio contra el que se mide si la cotización va rebajada. Espeja
// precio_referencia_producto() de la migración 0074: el piso pactado, y
// mientras gerencia no lo cargue, el mejor precio disponible. Sin la caída a
// 'optimo', los 7 semi-industriales que todavía no tienen 'deseado' salían
// como "sin piso" y pedían aprobación aun cotizados al precio de lista.
function precioReferencia(producto: Producto): number | null {
  for (const tier of ["deseado", "medio", "base", "optimo"]) {
    const p = precioTier(producto, tier);
    if (p !== null) return p;
  }
  return null;
}

function tierInicial(producto: Producto): string {
  return producto.segmento === "semi_industrial" ? "optimo" : "base";
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
      })) ?? [],
  );
  const [condiciones, setCondiciones] = useState(edicion?.condiciones ?? "Entrega: 15 días útiles. Garantía de fábrica.");
  const [vigenciaDias, setVigenciaDias] = useState(edicion?.vigenciaDias ?? 15);
  const [entregaLugar, setEntregaLugar] = useState<string>(edicion?.entregaLugar ?? ENTREGA_POR_DEFECTO);
  const [enviando, startTransition] = useTransition();


  // Lo que el selector grande necesita mostrar de cada equipo: el precio de
  // referencia ya resuelto y el stock del Excel de Lesly.
  const equiposParaElegir = useMemo(
    () => productos.map((p) => ({ ...p, precio: precioReferencia(p) })),
    [productos],
  );
  const cantidadesEnCarrito = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of carrito) if (i.producto_id) m[i.producto_id] = (m[i.producto_id] ?? 0) + i.cantidad;
    return m;
  }, [carrito]);

  // El clic en el selector AGREGA directo (pedido 25-08): elegir y después
  // apretar «Agregar» era confirmar dos veces lo mismo, porque el modal ya
  // muestra foto, precio, stock y avisos antes del clic. Un segundo clic en el
  // mismo equipo suma una unidad, no crea otra línea.
  function agregarProducto(producto: Producto) {
    const yaEsta = carrito.findIndex((i) => i.producto_id === producto.id);
    if (yaEsta >= 0) {
      setCarrito((c) => c.map((item, idx) => (idx === yaEsta ? { ...item, cantidad: item.cantidad + 1 } : item)));
      return;
    }
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
        precioPiso: precioReferencia(producto),
        sinFicha: Boolean(producto.sinFicha),
      },
    ]);
  }

  function quitarProducto(productoId: string) {
    setCarrito((c) => c.filter((i) => i.producto_id !== productoId));
  }

  // Resta una unidad desde el selector; el − en 1 quita el equipo.
  function restarProducto(productoId: string) {
    setCarrito((c) =>
      c
        .map((i) => (i.producto_id === productoId ? { ...i, cantidad: i.cantidad - 1 } : i))
        .filter((i) => i.cantidad > 0),
    );
  }

  function actualizarItem(i: number, cambios: Partial<ItemCarrito>) {
    setCarrito((c) => c.map((item, idx) => (idx === i ? { ...item, ...cambios } : item)));
  }

  function quitarItem(i: number) {
    setCarrito((c) => c.filter((_, idx) => idx !== i));
  }

  const total = carrito.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
  // Gerencia decide UNA sola cosa: equipos por debajo del precio de referencia
  // (migración 0074). Ser industrial dejó de bastar — el ing. Carlos lo revirtió
  // el 25-08: «coticemos el precio de lista nada más; la función debería ser
  // cuando quieres reducir ese precio». Se avisa ACÁ, antes de guardar, para que
  // la comercial sepa si la puede enviar de inmediato.
  const hayBajoLista = carrito.some((i) => i.precioPiso !== null && i.precio_unitario < i.precioPiso);
  // Un equipo sin NINGÚN precio cargado no se puede contrastar contra nada.
  const haySinPrecio = carrito.some((i) => i.producto_id !== null && i.precioPiso === null);
  const iraAGerencia = hayBajoLista || haySinPrecio;
  const motivoAprobacion = [
    hayBajoLista && "precio por debajo de la referencia",
    haySinPrecio && "equipo sin precio cargado",
  ]
    .filter(Boolean)
    .join(" y ");

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
          entregaLugar,
        });
        if (r.error) {
          toast.error(r.error);
          return;
        }
        toast.success(
          iraAGerencia
            ? `Cotización corregida — queda pendiente de aprobación de gerencia (${motivoAprobacion})`
            : "Cotización corregida",
        );
        router.push(`/comercial/oportunidades/${oportunidadId}`);
        router.refresh();
        return;
      }

      const resultado = await crearCotizacion({
        oportunidadId,
        serie,
        items,
        condiciones,
        vigenciaDias,
        entregaLugar,
      });
      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }
      toast.success(
        iraAGerencia
          ? `Cotización creada — queda pendiente de aprobación de gerencia (${motivoAprobacion})`
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

        {/* El selector grande (pedido 25-08): el clic AGREGA. La ventana queda
            abierta para cargar varios equipos seguidos — una cotización real
            trae 4 a 6 — y muestra cuáles ya están y cuántas unidades. */}
        <BuscadorEquiposModal
          productos={equiposParaElegir}
          enCarrito={cantidadesEnCarrito}
          onAgregar={(e) => { const p = productos.find((x) => x.id === e.id); if (p) agregarProducto(p); }}
          onRestar={restarProducto}
          onQuitar={quitarProducto}
        />
      </div>

      {/* Vista previa del equipo elegido, antes de agregarlo: revisar sirve
          mientras todavía se puede cambiar de opinión sin costo. */}

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
                        Por debajo de la referencia (US$ {item.precioPiso}) — requerirá aprobación de gerencia
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

      {/* Sale impreso como el punto 1 de "Importante". Hasta el 24-08 era un
          texto fijo; se elige por cotización porque lo acordado cambia con cada
          cliente (migración 0066). */}
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

      {/* Se dice ANTES de guardar, no después: si va a quedar esperando a
          gerencia, la comercial tiene que saberlo mientras todavía está
          armando la cotización, no cuando quiera enviarla. */}
      {carrito.length > 0 && iraAGerencia && (
        <p className="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-2 text-xs font-medium text-amber-800">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          Esta cotización va a quedar esperando la aprobación de gerencia ({motivoAprobacion}). No se
          podrá enviar al cliente hasta que la aprueben.
        </p>
      )}

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
