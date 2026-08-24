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
import { buscarEquipos } from "@/lib/buscar-equipo";
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
  /** Las primeras de la ficha: alcanzan para reconocer el equipo sin traerse
   *  la ficha completa de los 65 al navegador. */
  primerasCaracteristicas?: string[];
  nCaracteristicas?: number;
  nDimensiones?: number;
  /** El equipo no tiene datos técnicos cargados: su página de ficha saldría
   *  vacía en el PDF que recibe el cliente. */
  sinFicha?: boolean;
  sinFoto?: boolean;
  /** SKU del equipo hermano cuya foto se está mostrando. Pasa cuando el Word
   *  de este equipo trae un pantallazo en vez de una foto de producto. */
  fotoPrestadaDe?: string | null;
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
      {/* Antes acá decía "Elegido: …". Lo reemplaza la vista previa completa
          que se dibuja debajo del buscador: repetir el nombre no ayudaba a
          confirmar que el equipo es el correcto. */}
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

/**
 * Vista previa del equipo elegido, ANTES de agregarlo a la cotización.
 *
 * Pedido de Darwin el 24-08: «cuando se agrega el producto debería haber una
 * vista previa como para asegurarse de que ese es».
 *
 * El caso que lo motiva ya ocurrió: Brenda agregó la LG TITAN-18 a un cliente
 * real y se enteró de que no tenía datos técnicos recién al abrir el PDF, con
 * la hoja de especificaciones en blanco. Para entonces el error ya estaba en un
 * documento.
 *
 * CRITERIOS DE INTERFAZ, y por qué cada uno:
 *
 *  · VA ANTES DE CONFIRMAR, no después. Revisar sirve mientras todavía se puede
 *    cambiar de opinión sin costo. Aparece al elegir y se va al agregar.
 *  · LA FOTO MANDA. Reconocer una máquina de un vistazo es mucho más rápido y
 *    más seguro que leer "LAVTMAX17"; los códigos se parecen entre sí y ahí es
 *    donde se equivoca la gente apurada.
 *  · LOS AVISOS VAN DONDE SE DECIDE. "Sin ficha técnica" ya salía en la lista
 *    del buscador, pero en letra chica y mientras se navega. Acá se dice fuerte
 *    y con la consecuencia: qué va a ver el cliente.
 *  · SE MUESTRA EL PRECIO QUE SE VA A APLICAR. Así no hay sorpresa al agregar.
 *  · NO ESTORBA. Es un bloque compacto y el botón Agregar sigue a la vista; no
 *    hay que cerrarlo ni confirmarlo para seguir.
 */
function VistaPreviaEquipo({ producto }: { producto: Producto }) {
  const precio = precioTier(producto, tierInicial(producto));
  const piso = precioTier(producto, tierPiso(producto));
  const placa = [
    producto.capacidad,
    producto.calentamiento,
    producto.panel,
    producto.controles,
  ].filter(Boolean) as string[];

  return (
    <div className="mt-2 rounded-lg border border-border bg-secondary/30 p-3">
      <div className="flex gap-3">
        {/* Sin next/image a propósito: son PNG de public/ servidos tal cual, y
            acá se usan a 88 px — no hay nada que optimizar y sí un componente
            menos del que depender. */}
        {producto.fotoPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={producto.fotoPath}
            alt={`${producto.marca} ${producto.modelo}`}
            className="shrink-0 rounded-md border border-border bg-white object-contain p-1"
            style={{ width: 88, height: 88 }}
          />
        ) : (
          <div
            className="flex shrink-0 items-center justify-center rounded-md border border-dashed border-border text-[10px] text-muted-foreground"
            style={{ width: 88, height: 88 }}
          >
            Sin foto
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {producto.marca} {producto.modelo}
          </p>
          <p className="text-xs text-muted-foreground">{producto.nombre}</p>

          {placa.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {placa.map((d) => (
                <span key={d} className="rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-foreground">
                  {d}
                </span>
              ))}
            </div>
          )}

          <p className="mt-1.5 text-xs text-muted-foreground">
            {producto.sku ? <span className="font-mono">{producto.sku}</span> : "Sin código"}
            {precio != null && (
              <>
                {" · "}
                <span className="font-semibold text-foreground">US$ {precio.toLocaleString("es-PE")}</span>
                {piso != null && piso !== precio && ` · piso US$ ${piso.toLocaleString("es-PE")}`}
              </>
            )}
          </p>
        </div>
      </div>

      {/* Las primeras viñetas de la ficha: es lo que confirma que es el equipo
          y no otro parecido del mismo modelo. */}
      {(producto.primerasCaracteristicas?.length ?? 0) > 0 && (
        <ul className="mt-2.5 space-y-0.5 border-t border-border pt-2">
          {producto.primerasCaracteristicas!.map((c, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] text-muted-foreground">
              <span aria-hidden>•</span>
              <span className="line-clamp-1">{c}</span>
            </li>
          ))}
          <li className="pt-0.5 text-[11px] text-muted-foreground/80">
            {producto.nCaracteristicas} características y {producto.nDimensiones} medidas van completas en el PDF.
          </li>
        </ul>
      )}

      {producto.sinFicha && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] font-medium text-amber-800">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          Este equipo no tiene ficha técnica cargada: el cliente recibirá la hoja de especificaciones en blanco.
          Pídasela a logística antes de enviar la cotización.
        </p>
      )}
      {producto.fotoPrestadaDe && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] font-medium text-amber-800">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          La foto es la de {producto.fotoPrestadaDe}, un equipo hermano: la ficha de este trae un
          pantallazo en vez de una foto. Revise que la imagen corresponda antes de enviar.
        </p>
      )}
      {!producto.sinFicha && producto.sinFoto && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Sin foto cargada: la ficha del PDF sale sin imagen del equipo.
        </p>
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
        // Se resuelve contra el catálogo, no se asume `false`. Al reabrir un
        // borrador que ya traía un equipo sin ficha, el aviso desaparecía y el
        // comercial lo enviaba creyendo que estaba bien.
        sinFicha: Boolean(productos.find((p) => p.id === i.producto_id)?.sinFicha),
        fueraDeCatalogo: i.producto_id === null,
      })) ?? [],
  );
  // Sube en cada "Agregar" y hace de `key` del buscador: lo remonta limpio,
  // para que la caja no se quede con el equipo anterior escrito.
  const [vecesAgregado, setVecesAgregado] = useState(0);
  const [condiciones, setCondiciones] = useState(edicion?.condiciones ?? "Entrega: 15 días útiles. Garantía de fábrica.");
  const [vigenciaDias, setVigenciaDias] = useState(edicion?.vigenciaDias ?? 15);
  const [entregaLugar, setEntregaLugar] = useState<string>(edicion?.entregaLugar ?? ENTREGA_POR_DEFECTO);
  const [enviando, startTransition] = useTransition();

  const productoElegido = productos.find((p) => p.id === productoSeleccionado) ?? null;

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
  // Todo industrial pasa por gerencia aunque vaya al precio de lista (migración
  // 0067): en industriales el precio de lista es un punto de partida, no un
  // precio cerrado. Se avisa ACÁ, antes de guardar, para que la comercial no
  // arme la cotización creyendo que la puede enviar de inmediato.
  const hayIndustrial = carrito.some(
    (i) => productos.find((p) => p.id === i.producto_id)?.segmento === 'industrial',
  );
  const iraAGerencia = hayBajoLista || hayIndustrial;
  const motivoAprobacion = hayBajoLista
    ? hayIndustrial
      ? 'precio bajo lista y equipo industrial'
      : 'precio bajo lista'
    : 'equipo industrial';

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

      {/* Vista previa del equipo elegido, antes de agregarlo: revisar sirve
          mientras todavía se puede cambiar de opinión sin costo. */}
      {productoElegido && <VistaPreviaEquipo producto={productoElegido} />}

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
