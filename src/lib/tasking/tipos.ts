export type EstadoCompromiso = 'pendiente' | 'en_curso' | 'hecho' | 'anulado';

export interface Persona {
  id: string;
  nombre: string;
  apodos: string;
  cargo: string;
  correo: string | null;
  whatsapp: string | null;
  es_gerencia: boolean;
  activo: boolean;
  token: string;
  creado_en: string;
}

export interface Reunion {
  id: string;
  titulo: string;
  inicio: string;
  fin: string | null;
  estado: 'grabando' | 'procesando' | 'lista' | 'error';
  participantes: string[];
  transcripcion: string;
  audio_partes: number;
  resumen: string | null;
  temas: string[];
  acuerdos_generales: string[];
  modelo: string | null;
  fuente: string | null;
  error: string | null;
  intentos: number;
  procesado_en: string | null;
  creado_en: string;
}

export interface Compromiso {
  id: string;
  numero: number;
  reunion_id: string | null;
  persona_id: string | null;
  responsable_texto: string | null;
  descripcion: string;
  vence_en: string | null;
  hora_definida: boolean;
  estado: EstadoCompromiso;
  cita: string | null;
  hecho_en: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface Mensaje {
  id: string;
  canal: 'whatsapp' | 'correo';
  tipo: string;
  persona_id: string | null;
  compromiso_id: string | null;
  reunion_id: string | null;
  destino: string;
  asunto: string | null;
  cuerpo: string;
  html: string | null;
  enviar_en: string;
  estado: 'pendiente' | 'enviando' | 'enviado' | 'error' | 'cancelado';
  intentos: number;
  error: string | null;
  enviado_en: string | null;
  creado_en: string;
}

/** Un compromiso está vencido si sigue abierto y su plazo ya pasó (no se guarda, se calcula). */
export function estaVencido(c: Pick<Compromiso, 'estado' | 'vence_en'>, ahora = Date.now()) {
  return (c.estado === 'pendiente' || c.estado === 'en_curso') && !!c.vence_en && new Date(c.vence_en).getTime() < ahora;
}
