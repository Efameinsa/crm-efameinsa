import type { ItemCotizacion } from "@/lib/acciones/cotizaciones";

/**
 * Los tipos que comparten la pantalla del cotizador (cliente) y el cargador de
 * datos (servidor). Viven aparte para que un Server Component no tenga que
 * importar un módulo "use client" solo para nombrar una forma.
 */

export interface PrecioTier {
  tier: string;
  precio: number;
}

export interface ProductoCotizable {
  id: string;
  sku: string | null;
  marca: string;
  modelo: string;
  nombre: string;
  capacidad: string | null;
  /** «Apilable» / «No apilable». Solo lo declaran los equipos LG. */
  montaje?: string | null;
  segmento: "industrial" | "semi_industrial";
  precios_producto: PrecioTier[];
  /** Cómo calienta (Gas GLP, ELÉCTRICA, Gas natural…). Vive en la ficha, no en
   *  el nombre, y es como la gente pide el equipo: "secadora eléctrica". */
  calentamiento?: string | null;
  panel?: string | null;
  controles?: string | null;
  /** Si el número de arriba lo puso el almacén (0117) y no el Excel. Un
   *  conteo de verdad y una cifra copiada a mano no se leen igual. */
  stockEnVivo?: boolean;
  /** Colores en los que existe el equipo (coches de transporte, sobre todo). */
  colores?: string[];
  /** Ruta pública de la foto ("/productos/x.png"), para la vista previa. */
  fotoPath?: string | null;
  /** Una foto por color, cuando el equipo se fabrica en varios (los coches de
   *  transporte de ropa): { "Azul": "/productos/co402.png", … }. Cada una sale
   *  del Word que Lesly hizo para ese color. */
  fotosPorColor?: Record<string, string>;
  /** La ficha completa, títulos de bloque incluidos: el selector la muestra
   *  entera (reunión con gerencia 25-08). */
  caracteristicas?: string[];
  nDimensiones?: number;
  /** El equipo no tiene datos técnicos cargados: su página de ficha saldría
   *  vacía en el PDF que recibe el cliente. */
  sinFicha?: boolean;
  sinFoto?: boolean;
  /** SKU del equipo hermano cuya foto se está mostrando. */
  fotoPrestadaDe?: string | null;
  /** Unidades según la columna STOCK del Excel de Lesly. null = sin dato. */
  stock?: number | null;
  /** Descripción del maestro de Lesly: solo alimenta la búsqueda del selector. */
  descripcion?: string | null;
}

export interface ItemCarrito extends ItemCotizacion {
  nombre: string;
  precioPiso: number | null;
  sinFicha: boolean;
  /** Escrito a mano porque el equipo no está en el catálogo todavía (lo carga
   *  el administrador; el comercial ya no puede crearlos, decisión 24-08). */
  fueraDeCatalogo?: boolean;
}

export interface HistorialPrecio {
  precio: number;
  fecha: string;
}

/** El borrador que la pantalla está editando. */
export interface BorradorEnEdicion {
  cotizacionId: string;
  codigo: string | null;
  serie: "EFAMEINSA" | "OPEN";
  condiciones: string | null;
  vigenciaDias: number;
  entregaLugar: string | null;
  /** Las cuatro columnas de la tabla de condiciones que cierra cada ficha del
   *  PDF (migración 0094). */
  tiempoEntrega: string | null;
  garantia: string | null;
  formaPago: string | null;
  saldo: string | null;
  /** Lo que dice la BASE sobre la aprobación del precio. Manda sobre el cálculo
   *  de la pantalla: un borrador que gerencia YA aprobó se puede enviar aunque
   *  sus precios sigan por debajo de la referencia. */
  estadoAprobacion: string;
  /** Por qué gerencia lo rechazó, para poder corregir sin ir a buscarlo. */
  notaGerencia: string | null;
  items: {
    producto_id: string | null;
    descripcion: string | null;
    nombre: string;
    cantidad: number;
    precio_unitario: number;
    precioPiso: number | null;
    /** Color con el que se estaba ofreciendo el equipo (migración 0088). */
    color: string | null;
  }[];
}
