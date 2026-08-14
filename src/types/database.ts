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
  created_at: string;
  updated_at: string;
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
  intencion: "alta" | "media" | "baja" | "sin_definir";
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
