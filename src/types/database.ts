// Tipos escritos a mano para el piloto (B1). Reemplazar por los generados con
// `supabase gen types typescript` en cuanto exista el proyecto Supabase enlazado —
// mientras tanto deben mantenerse sincronizados a mano con
// supabase/migrations/0001_esquema_inicial.sql.

export type RolUsuario = "admin" | "gerencia" | "central" | "comercial";

export type AreaDestino =
  | "comercial"
  | "servicio_tecnico"
  | "postventa"
  | "rrhh"
  | "proveedores"
  | "administracion"
  | "otros";

export type CanalContacto =
  | "whatsapp"
  | "llamada"
  | "formulario_web"
  | "facebook"
  | "instagram"
  | "email"
  | "presencial"
  | "referido"
  | "otro";

export type EstadoLead =
  | "pendiente_triaje"
  | "historico" // importado de Google Ads, gestionado antes del CRM (ver migración 0016)
  | "derivado_area"
  | "asignado"
  | "duplicado"
  | "descartado";

export type EtapaOportunidad =
  | "asignada"
  | "filtrada"
  | "cotizada"
  | "seguimiento"
  | "potencial"
  | "venta"
  | "rechazada"
  | "derivada";

export type SerieCotizacion = "EFAMEINSA" | "OPEN";

export interface Perfil {
  id: string;
  nombre: string;
  rol: RolUsuario;
  codigo_comercial: string | null;
  meta_mensual: number | null;
  activo: boolean;
  /** Cuenta de práctica: su trabajo no entra en ningún indicador (0072). */
  es_prueba?: boolean;
  /** Área de postventa: usa el CRM como comercial, pero no vende (0075). */
  es_postventa?: boolean;
  /** Comercial que además atiende postventa de sus clientes (migración 0093). */
  hace_postventa?: boolean;
  /** Acompaña a los usuarios: ve las dos barras y no se le mide como comercial (0101). */
  es_soporte?: boolean;
  created_at: string;
  updated_at: string;
}

/** Clase de caso que Central deriva a postventa (migración 0075). */
export type TipoPostventa = "garantia" | "repuesto" | "mantenimiento";

export interface ServicioPostventa {
  id: string;
  cuenta_id: string | null;
  cliente_texto: string | null;
  fecha_confirmacion: string | null;
  ubicacion: string | null;
  equipo: string | null;
  tipo_servicio: string;
  observaciones: string | null;
  monto: number | null;
  moneda: string;
  forma_pago: string | null;
  confirmacion_abono: string | null;
  prueba_embalaje: string | null;
  fecha_despacho: string | null;
  despacho_nota: string | null;
  planos_preinstalacion: string | null;
  puesta_en_marcha: string | null;
  puesta_nota: string | null;
  completado: boolean;
  informe: string | null;
}

export interface Lead {
  id: string;
  codigo: string | null;
  estado: EstadoLead;
  area_destino: AreaDestino;
  canal: CanalContacto;
  fuente: string | null;
  gclid: string | null;
  fbclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  nombre_contacto: string | null;
  telefono: string | null;
  telefono_normalizado: string | null;
  email: string | null;
  num_doc: string | null;
  razon_social: string | null;
  mensaje: string | null;
  recibido_at: string;
  recibido_por: string | null;
  asignado_a: string | null;
  asignado_at: string | null;
  asignado_por: string | null;
  cuenta_id: string | null;
  duplicado_de: string | null;
  created_at: string;
  updated_at: string;
}

export interface Cuenta {
  id: string;
  tipo_doc: "RUC" | "DNI" | "CE" | "SIN_DOC";
  num_doc: string | null;
  razon_social: string;
  nombre_comercial: string | null;
  rubro_id: number | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  direccion: string | null;
  comercial_id: string | null;
  cartera_desde: string | null;
  ultima_venta_at: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface Oportunidad {
  id: string;
  cuenta_id: string;
  lead_id: string | null;
  comercial_id: string;
  etapa: EtapaOportunidad;
  motivo_rechazo_id: number | null;
  intencion: "alto_potencial" | "medio_alto" | "medio" | "medio_bajo" | "bajo" | "sin_definir";
  segmento: "industrial" | "semi_industrial" | null;
  monto_estimado: number | null;
  moneda: "PEN" | "USD";
  proxima_accion: string | null;
  proxima_accion_at: string | null;
  cerrada_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Acceso {
  id: string;
  user_id: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}
