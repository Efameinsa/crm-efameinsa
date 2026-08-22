"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { crearCotizacion, type ItemCotizacion } from "@/lib/acciones/cotizaciones";
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
}

interface ItemCarrito extends ItemCotizacion {
  nombre: string;
  precioPiso: number | null;
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

export function Cotizador({
  oportunidadId,
  productos,
  historialPrecios = {},
}: {
  oportunidadId: string;
  productos: Producto[];
  historialPrecios?: Record<string, HistorialPrecio>;
}) {
  const router = useRouter();
  const [serie, setSerie] = useState<"EFAMEINSA" | "OPEN">("EFAMEINSA");
  const [productoSeleccionado, setProductoSeleccionado] = useState("");
  // El catálogo pasó de 7 equipos a 65 al cargar el maestro: sin buscador,
  // elegir uno era recorrer una lista larguísima. Se filtra por código,
  // marca, modelo, nombre o capacidad, que es como los nombra la gente.
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const productosFiltrados = useMemo(() => {
    const q = busquedaProducto.trim().toLowerCase();
    if (!q) return productos;
    const partes = q.split(/\s+/);
    return productos.filter((p) => {
      const texto = `${p.sku ?? ""} ${p.marca} ${p.modelo} ${p.nombre} ${p.capacidad ?? ""}`.toLowerCase();
      return partes.every((parte) => texto.includes(parte));
    });
  }, [productos, busquedaProducto]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [condiciones, setCondiciones] = useState("Entrega: 15 días útiles. Garantía de fábrica.");
  const [vigenciaDias, setVigenciaDias] = useState(15);
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
      },
    ]);
    setProductoSeleccionado("");
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
    startTransition(async () => {
      const resultado = await crearCotizacion({
        oportunidadId,
        serie,
        items: carrito.map(({ producto_id, cantidad, precio_unitario, tier_aplicado }) => ({
          producto_id,
          cantidad,
          precio_unitario,
          tier_aplicado,
        })),
        condiciones,
        vigenciaDias,
      });
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
      <div className="flex gap-3">
        <Select value={serie} onValueChange={(v) => setSerie((v as typeof serie) ?? "EFAMEINSA")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EFAMEINSA">EFAMEINSA</SelectItem>
            <SelectItem value="OPEN">OPEN</SelectItem>
          </SelectContent>
        </Select>

        <Input
          value={busquedaProducto}
          onChange={(e) => setBusquedaProducto(e.target.value)}
          placeholder="Buscar equipo (código, marca, modelo, capacidad)…"
          className="w-64"
          aria-label="Buscar equipo"
        />

        <Select value={productoSeleccionado} onValueChange={(v) => setProductoSeleccionado(v ?? "")}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={`Elegir equipo… (${productosFiltrados.length})`} />
          </SelectTrigger>
          <SelectContent>
            {productosFiltrados.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.sku ? `${p.sku} · ` : ""}
                {p.marca} {p.modelo}
                {p.capacidad ? ` · ${p.capacidad}` : ""} — {p.nombre}
              </SelectItem>
            ))}
            {productosFiltrados.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">Ningún equipo coincide con esa búsqueda.</div>
            )}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" onClick={agregarProducto} disabled={!productoSeleccionado}>
          Agregar
        </Button>
      </div>

      {carrito.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="w-20">Cant.</TableHead>
              <TableHead className="w-32">Precio unit.</TableHead>
              <TableHead className="w-28">Subtotal</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {carrito.map((item, i) => {
              const bajoLista = item.precioPiso !== null && item.precio_unitario < item.precioPiso;
              const historial = historialPrecios[item.producto_id];
              const regalandoMargen = historial !== undefined && historial.precio > item.precio_unitario;
              return (
                <TableRow key={i}>
                  <TableCell>
                    {item.nombre}
                    {bajoLista && (
                      <p className="text-xs text-destructive">
                        Bajo lista (piso: {item.precioPiso}) — requerirá aprobación de gerencia
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
                        {new Date(historial.fecha).toLocaleDateString("es-PE")}
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
                  <TableCell>{(item.cantidad * item.precio_unitario).toFixed(2)}</TableCell>
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
        <p className="flex-1 text-right text-lg font-medium">Total: {total.toFixed(2)}</p>
      </div>

      <Button onClick={confirmar} disabled={enviando || carrito.length === 0}>
        {enviando ? "Creando…" : "Crear cotización"}
      </Button>
    </div>
  );
}
