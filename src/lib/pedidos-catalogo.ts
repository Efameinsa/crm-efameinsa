// Tipos de los pedidos al catálogo (0523, Santos 17-10). Aparte de la acción
// «use server» porque esa solo puede exportar funciones asíncronas.

export type TipoPedidoCatalogo = "producto_nuevo" | "corregir_producto" | "precio" | "stock" | "otro";
export type EstadoPedidoCatalogo = "nuevo" | "en_proceso" | "hecho" | "no_procede";

export const TIPOS_PEDIDO_CATALOGO: { valor: TipoPedidoCatalogo; etiqueta: string; ayuda: string; emoji: string }[] = [
  { valor: "producto_nuevo", etiqueta: "Producto que no está", ayuda: "Un equipo, repuesto o servicio que no encuentra al cotizar", emoji: "📦" },
  { valor: "corregir_producto", etiqueta: "Corregir un producto", ayuda: "Nombre, descripción, ficha técnica, fotos o código", emoji: "✏️" },
  { valor: "precio", etiqueta: "Precio", ayuda: "Un precio que no está, está mal o cambió", emoji: "💲" },
  { valor: "stock", etiqueta: "Stock", ayuda: "Si hay, cuándo llega o figura mal", emoji: "🏷️" },
  { valor: "otro", etiqueta: "Otra cosa del catálogo", ayuda: "Algo más que tenga que actualizar operaciones", emoji: "📋" },
];

export const ESTADOS_PEDIDO_CATALOGO: { valor: EstadoPedidoCatalogo; etiqueta: string; clase: string }[] = [
  { valor: "nuevo", etiqueta: "Recibido", clase: "bg-sky-500/12 text-sky-800 dark:text-sky-300" },
  { valor: "en_proceso", etiqueta: "Lesly lo está viendo", clase: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
  { valor: "hecho", etiqueta: "Hecho", clase: "bg-[#1E7F4F]/12 text-[#1E7F4F]" },
  { valor: "no_procede", etiqueta: "No procede", clase: "bg-secondary text-muted-foreground" },
];

export interface AdjuntoPedidoCatalogo {
  path: string;
  nombre: string;
  tipo: string;
  tamano: number;
}

export interface PedidoCatalogo {
  id: string;
  autor_id: string;
  autor_nombre: string;
  autor_codigo: string | null;
  tipo: TipoPedidoCatalogo;
  producto: string | null;
  para_cliente: string | null;
  titulo: string;
  detalle: string;
  adjuntos: (AdjuntoPedidoCatalogo & { url: string | null })[];
  estado: EstadoPedidoCatalogo;
  respuesta: string | null;
  respondida_por_nombre: string | null;
  respondida_at: string | null;
  created_at: string;
  desde_buzon: boolean;
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const CATALOGO =
  /\b(agregar|agreguen|anadir|incluir|subir|actualizar|corregir|cambiar|falta|faltan|no (esta|aparece|encuentro|figura|hay))\b[^.]{0,40}\b(fichas? tecnicas?|productos?|equipos?|repuestos?|modelos?|precios?|costos?|stock)\b|\blista de precios\b/;
const SISTEMA =
  /\b(error|falla|no carga|no abre|botone?s?|pantalla|vista|pedidos?|apertura|reporte|informe|protocolo|filtro|almacen|codigo|generacion|se cuelga|no guarda|lento)\b/;

/**
 * ¿Lo que escribieron en el buzón del CRM es en realidad un pedido para Lesly?
 * Pedir o corregir un producto, un precio, una ficha técnica o el stock, sin
 * palabras de una pantalla del CRM (pedido, apertura, botón…). Manda el
 * título: si ahí lo pide, basta con que el título no hable de una pantalla.
 * Probado con las 149 observaciones del 06–16/10: marca la de las fichas de
 * las teñidoras (Brenda) y ninguna de pantallas. Solo muestra un aviso.
 */
export function pareceDelCatalogo(titulo: string, detalle = ""): boolean {
  const t = normalizar(titulo);
  if (CATALOGO.test(t)) return !SISTEMA.test(t);
  const todo = `${t} ${normalizar(detalle)}`;
  return CATALOGO.test(todo) && !SISTEMA.test(todo);
}

/** ¿Pide un rubro? Esos los agrega cada uno desde «Cambiar rubro» (0163). */
export function pideUnRubro(texto: string): boolean {
  return /\brubros?\b/.test(normalizar(texto));
}
