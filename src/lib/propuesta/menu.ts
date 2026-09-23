import type { Perfil } from "@/types/database";

/**
 * EL MENÚ DE LA PROPUESTA DE NAVEGACIÓN (aprobada por gerencia el 23-09).
 *
 * Siete reglas: todos abren en «Hoy»; seis o siete opciones; el mismo nombre
 * para lo mismo en todos los perfiles; una ficha del cliente y una del pedido;
 * Buscar arriba; y se ve a quién se espera. Documento para gerencia:
 * Descargas/Propuesta-navegacion-CRM-2026-09-23.html.
 *
 * Cada opción apunta a una pantalla que ya existe o a una SECCIÓN con
 * pestañas (/nuevo/<seccion>/<pestaña>) que reúne las pantallas que hoy están
 * separadas con otro nombre. Ninguna pantalla se reescribió: se reordenaron.
 * `coincide` son los caminos que cuentan como «estar en» esa opción, para que
 * el menú siga marcado al entrar a una ficha.
 */

export type TipoPerfil =
  | "central"
  | "comercial"
  | "postventa"
  | "preventivo"
  | "almacen"
  | "finanzas"
  | "operaciones"
  | "gerencia"
  | "admin";

export type Icono =
  | "hoy" | "conversaciones" | "seguimiento" | "pedidos" | "clientes" | "agenda" | "oportunidades" | "ventas"
  | "numeros" | "atenciones" | "vender" | "campana" | "informes" | "cobranza" | "abonos" | "catalogo" | "permisos"
  | "aprobaciones" | "marketing" | "operacion" | "control" | "usuarios" | "listas";

export interface OpcionMenu {
  etiqueta: string;
  href: string;
  icono: Icono;
  coincide: string[];
}

export interface Pestana {
  clave: string;
  etiqueta: string;
  /** Pantalla existente que se muestra en esta pestaña (clave de PAGINAS). */
  pagina: string;
  /** Parámetros fijos que esa pantalla necesita (ej. todos=1). */
  fijos?: Record<string, string>;
}

export interface Seccion {
  titulo: string;
  ayuda: string;
  pestanas: Pestana[];
}

export function tipoDePerfil(p: Perfil): TipoPerfil {
  if (p.rol === "gerencia") return "gerencia";
  if (p.rol === "admin") return "admin";
  if (p.rol === "central") return "central";
  if (p.rol === "finanzas") return "finanzas";
  if (p.rol === "operaciones") return "operaciones";
  if (p.es_almacen) return "almacen";
  if (p.es_postventa && p.solo_preventivo) return "preventivo";
  if (p.es_postventa) return "postventa";
  return "comercial";
}

export const NOMBRE_PERFIL: Record<TipoPerfil, string> = {
  central: "Central",
  comercial: "Comercial",
  postventa: "Postventa",
  preventivo: "Postventa · preventivos",
  almacen: "Almacén",
  finanzas: "Finanzas",
  operaciones: "Operaciones",
  gerencia: "Gerencia",
  admin: "Administración",
};

const hoy: OpcionMenu = { etiqueta: "Hoy", href: "/nuevo", icono: "hoy", coincide: [] };
const conversaciones: OpcionMenu = { etiqueta: "Conversaciones", href: "/whatsapp", icono: "conversaciones", coincide: ["/whatsapp"] };

export const MENU: Record<TipoPerfil, OpcionMenu[]> = {
  central: [
    hoy,
    conversaciones,
    { etiqueta: "Seguimiento", href: "/central/derivados", icono: "seguimiento", coincide: ["/central/derivados"] },
    { etiqueta: "Pedidos", href: "/central/cierres", icono: "pedidos", coincide: ["/central/cierres"] },
    { etiqueta: "Clientes", href: "/nuevo/clientes", icono: "clientes", coincide: ["/nuevo/clientes", "/central/clientes", "/central/presupuestos"] },
    { etiqueta: "Agenda", href: "/central/visitas", icono: "agenda", coincide: ["/central/visitas"] },
  ],
  comercial: [
    hoy,
    conversaciones,
    { etiqueta: "Oportunidades", href: "/nuevo/oportunidades", icono: "oportunidades", coincide: ["/nuevo/oportunidades", "/comercial/oportunidades", "/comercial/potenciales"] },
    { etiqueta: "Cotizaciones y ventas", href: "/nuevo/ventas", icono: "ventas", coincide: ["/nuevo/ventas", "/comercial/cotizaciones", "/comercial/cierres", "/comercial/informes"] },
    { etiqueta: "Clientes", href: "/nuevo/clientes", icono: "clientes", coincide: ["/nuevo/clientes", "/comercial/cartera", "/comercial/parque", "/comercial/ruta"] },
    { etiqueta: "Agenda", href: "/nuevo/agenda", icono: "agenda", coincide: ["/nuevo/agenda", "/comercial/agenda", "/comercial/visitas"] },
    { etiqueta: "Mis números", href: "/comercial/mi-gestion", icono: "numeros", coincide: ["/comercial/mi-gestion"] },
  ],
  postventa: [
    hoy,
    { etiqueta: "Pedidos", href: "/postventa/control", icono: "pedidos", coincide: ["/postventa/control", "/postventa/pedidos"] },
    { etiqueta: "Atenciones", href: "/postventa/atenciones", icono: "atenciones", coincide: ["/postventa/atenciones", "/postventa/casos", "/postventa/informes"] },
    { etiqueta: "Clientes", href: "/nuevo/clientes", icono: "clientes", coincide: ["/nuevo/clientes", "/comercial/cartera", "/postventa/equipos", "/comercial/parque"] },
    { etiqueta: "Vender", href: "/nuevo/vender", icono: "vender", coincide: ["/nuevo/vender", "/comercial/ruta", "/comercial/cotizaciones", "/comercial/cierres", "/comercial/mi-gestion", "/comercial/oportunidades"] },
    { etiqueta: "Agenda", href: "/nuevo/agenda", icono: "agenda", coincide: ["/nuevo/agenda", "/postventa/agenda", "/postventa/visitas"] },
  ],
  preventivo: [
    hoy,
    { etiqueta: "Campaña", href: "/nuevo/campana", icono: "campana", coincide: ["/nuevo/campana", "/comercial/ruta", "/comercial/parque"] },
    { etiqueta: "Cotizaciones y ventas", href: "/nuevo/ventas", icono: "ventas", coincide: ["/nuevo/ventas", "/comercial/cotizaciones", "/comercial/cierres", "/comercial/oportunidades"] },
    { etiqueta: "Clientes", href: "/comercial/cartera", icono: "clientes", coincide: ["/comercial/cartera"] },
    { etiqueta: "Mis números", href: "/comercial/mi-gestion", icono: "numeros", coincide: ["/comercial/mi-gestion"] },
  ],
  almacen: [
    hoy,
    { etiqueta: "Pedidos", href: "/almacen/pedidos", icono: "pedidos", coincide: ["/almacen/pedidos"] },
    { etiqueta: "Agenda", href: "/nuevo/agenda", icono: "agenda", coincide: ["/nuevo/agenda", "/almacen/agenda", "/almacen/atenciones", "/almacen/visitas"] },
    { etiqueta: "Informes técnicos", href: "/almacen/informes", icono: "informes", coincide: ["/almacen/informes"] },
  ],
  finanzas: [
    hoy,
    { etiqueta: "Cobranza", href: "/finanzas/cobrar", icono: "cobranza", coincide: ["/finanzas/cobrar"] },
    { etiqueta: "Abonos", href: "/finanzas/confirmados", icono: "abonos", coincide: ["/finanzas/confirmados"] },
  ],
  operaciones: [
    hoy,
    { etiqueta: "Catálogo", href: "/operaciones/catalogo", icono: "catalogo", coincide: ["/operaciones/catalogo"] },
    { etiqueta: "Permisos y listas", href: "/nuevo/permisos", icono: "permisos", coincide: ["/nuevo/permisos", "/operaciones/permisos", "/admin/catalogos"] },
  ],
  gerencia: [
    hoy,
    { etiqueta: "Aprobaciones", href: "/gerencia/aprobaciones", icono: "aprobaciones", coincide: ["/gerencia/aprobaciones"] },
    { etiqueta: "Ventas", href: "/nuevo/ventas", icono: "ventas", coincide: ["/nuevo/ventas", "/gerencia/supervision", "/gerencia/potenciales", "/gerencia/comerciales", "/central/presupuestos", "/central/cierres"] },
    { etiqueta: "Marketing", href: "/nuevo/marketing", icono: "marketing", coincide: ["/nuevo/marketing", "/gerencia/marketing", "/gerencia/finanzas", "/whatsapp"] },
    { etiqueta: "Operación", href: "/nuevo/operacion", icono: "operacion", coincide: ["/nuevo/operacion", "/postventa", "/finanzas"] },
    { etiqueta: "Clientes", href: "/nuevo/clientes", icono: "clientes", coincide: ["/nuevo/clientes", "/gerencia/clientes", "/gerencia/cartera-liberable"] },
    { etiqueta: "Control", href: "/nuevo/control", icono: "control", coincide: ["/nuevo/control", "/gerencia/accesos", "/gerencia/auditoria", "/gerencia/reportes"] },
  ],
  admin: [
    { etiqueta: "Usuarios", href: "/admin", icono: "usuarios", coincide: [] },
    { etiqueta: "Catálogo", href: "/operaciones/catalogo", icono: "catalogo", coincide: ["/operaciones/catalogo", "/admin/productos"] },
    { etiqueta: "Listas del sistema", href: "/admin/catalogos", icono: "listas", coincide: ["/admin/catalogos"] },
  ],
};

/** «Ver como» de operaciones: acompañar a un área sin copiar su menú. */
export const VER_COMO: { etiqueta: string; href: string }[] = [
  { etiqueta: "Postventa", href: "/postventa/macro" },
  { etiqueta: "Almacén", href: "/almacen" },
];

/** Adónde busca cada perfil desde la cabecera. */
export const BUSCAR_EN: Record<TipoPerfil, { href: string; ayuda: string }> = {
  central: { href: "/gerencia/buscar", ayuda: "Presupuesto, cierre, PRO, RUC, cliente o serie" },
  gerencia: { href: "/gerencia/buscar", ayuda: "Presupuesto, cierre, PRO, RUC, cliente o serie" },
  operaciones: { href: "/gerencia/buscar", ayuda: "Presupuesto, cierre, PRO, RUC, cliente o serie" },
  admin: { href: "/gerencia/buscar", ayuda: "Presupuesto, cierre, PRO, RUC, cliente o serie" },
  comercial: { href: "/comercial/cartera", ayuda: "Cliente o RUC de su cartera" },
  postventa: { href: "/comercial/cartera", ayuda: "Cliente o RUC" },
  preventivo: { href: "/comercial/cartera", ayuda: "Cliente o RUC" },
  almacen: { href: "/almacen/pedidos", ayuda: "Cliente, equipo o guía" },
  finanzas: { href: "/finanzas/confirmados", ayuda: "Cliente, N.º de operación o banco" },
};

/**
 * Las secciones con pestañas. La clave es `<perfil>/<seccion>`: la misma
 * palabra («Clientes», «Agenda») reúne pantallas distintas según quién mira.
 */
export const SECCIONES: Record<string, Seccion> = {
  "central/clientes": {
    titulo: "Clientes",
    ayuda: "Toda la cartera, en lectura, y todas las cotizaciones de la empresa.",
    pestanas: [
      { clave: "", etiqueta: "Clientes", pagina: "central/clientes" },
      { clave: "cotizaciones", etiqueta: "Cotizaciones", pagina: "central/presupuestos" },
    ],
  },
  "comercial/oportunidades": {
    titulo: "Oportunidades",
    ayuda: "El embudo entero y, aparte, lo que cierra esta semana.",
    pestanas: [
      { clave: "", etiqueta: "Embudo", pagina: "comercial/oportunidades" },
      { clave: "semana", etiqueta: "Cierra esta semana", pagina: "comercial/potenciales" },
    ],
  },
  "comercial/ventas": {
    titulo: "Cotizaciones y ventas",
    ayuda: "Lo que usted produce: cotizaciones y cierres de venta.",
    pestanas: [
      { clave: "", etiqueta: "Cotizaciones", pagina: "comercial/cotizaciones" },
      { clave: "cierres", etiqueta: "Ventas emitidas", pagina: "comercial/cierres" },
    ],
  },
  "comercial/clientes": {
    titulo: "Clientes",
    ayuda: "Su cartera y, si vende mantenimiento, las máquinas de sus clientes.",
    pestanas: [
      { clave: "", etiqueta: "Cartera", pagina: "comercial/cartera" },
      { clave: "maquinas", etiqueta: "Máquinas", pagina: "comercial/parque" },
    ],
  },
  "comercial/agenda": {
    titulo: "Agenda",
    ayuda: "Sus próximas acciones y las visitas a planta.",
    pestanas: [
      { clave: "", etiqueta: "Calendario", pagina: "comercial/agenda" },
      { clave: "visitas", etiqueta: "Visitas a planta", pagina: "comercial/visitas" },
    ],
  },
  "postventa/clientes": {
    titulo: "Clientes",
    ayuda: "A quién atiende, qué máquinas tiene y todas las ventas de la empresa.",
    pestanas: [
      { clave: "", etiqueta: "Clientes", pagina: "comercial/cartera" },
      { clave: "maquinas", etiqueta: "Máquinas", pagina: "postventa/equipos" },
      { clave: "ventas-empresa", etiqueta: "Ventas de la empresa", pagina: "comercial/parque", fijos: { todos: "1" } },
    ],
  },
  "postventa/vender": {
    titulo: "Vender",
    ayuda: "La campaña de preventivos, las cotizaciones, las ventas emitidas y sus números.",
    pestanas: [
      { clave: "", etiqueta: "Campaña de preventivos", pagina: "comercial/ruta" },
      { clave: "cotizaciones", etiqueta: "Cotizaciones", pagina: "comercial/cotizaciones" },
      { clave: "cierres", etiqueta: "Ventas emitidas", pagina: "comercial/cierres" },
      { clave: "numeros", etiqueta: "Mis números", pagina: "comercial/mi-gestion" },
    ],
  },
  "postventa/agenda": {
    titulo: "Agenda",
    ayuda: "Despachos, atenciones y visitas a planta en un solo calendario.",
    pestanas: [
      { clave: "", etiqueta: "Calendario", pagina: "postventa/agenda" },
      { clave: "visitas", etiqueta: "Visitas a planta", pagina: "postventa/visitas" },
    ],
  },
  "preventivo/campana": {
    titulo: "Campaña",
    ayuda: "A quién ofrecerle el preventivo: los clientes que ya se atendieron y los que nunca tuvieron mantenimiento.",
    pestanas: [
      { clave: "", etiqueta: "Preventivos por vender", pagina: "comercial/ruta" },
      { clave: "ventas-empresa", etiqueta: "Ventas de la empresa", pagina: "comercial/parque", fijos: { todos: "1" } },
    ],
  },
  "preventivo/ventas": {
    titulo: "Cotizaciones y ventas",
    ayuda: "Sus cotizaciones de mantenimiento y los cierres emitidos.",
    pestanas: [
      { clave: "", etiqueta: "Cotizaciones", pagina: "comercial/cotizaciones" },
      { clave: "cierres", etiqueta: "Ventas emitidas", pagina: "comercial/cierres" },
    ],
  },
  "almacen/agenda": {
    titulo: "Agenda",
    ayuda: "Despachos programados, atenciones con técnico y visitas a planta.",
    pestanas: [
      { clave: "", etiqueta: "Calendario", pagina: "almacen/agenda" },
      { clave: "atenciones", etiqueta: "Atenciones programadas", pagina: "almacen/atenciones" },
      { clave: "visitas", etiqueta: "Visitas a planta", pagina: "almacen/visitas" },
    ],
  },
  "operaciones/permisos": {
    titulo: "Permisos y listas",
    ayuda: "Quién puede qué, y las listas que usa todo el CRM.",
    pestanas: [
      { clave: "", etiqueta: "Permisos", pagina: "operaciones/permisos" },
      { clave: "listas", etiqueta: "Listas del sistema", pagina: "admin/catalogos" },
    ],
  },
  "gerencia/ventas": {
    titulo: "Ventas",
    ayuda: "El panel comercial, el día de cada comercial, lo que cierra esta semana y todos los documentos.",
    pestanas: [
      { clave: "", etiqueta: "Panel comercial", pagina: "gerencia/panel" },
      { clave: "supervision", etiqueta: "Supervisión diaria", pagina: "gerencia/supervision" },
      { clave: "semana", etiqueta: "Cierra esta semana", pagina: "gerencia/potenciales" },
      { clave: "cotizaciones", etiqueta: "Cotizaciones", pagina: "central/presupuestos" },
      { clave: "cierres", etiqueta: "Cierres de venta", pagina: "central/cierres" },
    ],
  },
  "gerencia/marketing": {
    titulo: "Marketing",
    ayuda: "Lo invertido, lo que trajo y lo que vendió; y los turnos del WhatsApp de anuncios.",
    pestanas: [
      { clave: "", etiqueta: "Panel de marketing", pagina: "gerencia/marketing" },
      { clave: "finanzas", etiqueta: "Retorno", pagina: "gerencia/finanzas" },
      { clave: "whatsapp", etiqueta: "WhatsApp de anuncios", pagina: "gerencia/marketing/whatsapp" },
    ],
  },
  "gerencia/operacion": {
    titulo: "Operación",
    ayuda: "Los pedidos de punta a punta y lo que falta cobrar, sin entrar a cada área.",
    pestanas: [
      { clave: "", etiqueta: "Pedidos", pagina: "postventa/control" },
      { clave: "cobranza", etiqueta: "Cobranza", pagina: "finanzas/cobrar" },
    ],
  },
  "gerencia/clientes": {
    titulo: "Clientes",
    ayuda: "Toda la cartera y, aparte, la que ya se puede redistribuir.",
    pestanas: [
      { clave: "", etiqueta: "Clientes", pagina: "gerencia/clientes" },
      { clave: "liberables", etiqueta: "Para redistribuir", pagina: "gerencia/cartera-liberable" },
    ],
  },
  "gerencia/control": {
    titulo: "Control",
    ayuda: "Quién entra y desde dónde, ver el CRM como cualquier cuenta, y quién cerró su día.",
    pestanas: [
      { clave: "", etiqueta: "Cierre del día", pagina: "gerencia/reportes" },
      { clave: "accesos", etiqueta: "Accesos y equipos", pagina: "gerencia/accesos" },
      { clave: "auditoria", etiqueta: "Ver como otra cuenta", pagina: "gerencia/auditoria" },
    ],
  },
};
