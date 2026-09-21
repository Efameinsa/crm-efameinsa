// Constantes de los turnos de WhatsApp (0262). Van aparte de las acciones
// porque un archivo "use server" solo puede exportar funciones async.

export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;

export type ResultadoAsignacionAutomatica = "asignado" | "retenido_cartera_ajena" | "retenido_sin_turno" | "retenido_error";

export const ETIQUETA_RESULTADO: Record<ResultadoAsignacionAutomatica, string> = {
  asignado: "Asignado al turno",
  retenido_cartera_ajena: "Retenido: cliente de otro comercial",
  retenido_sin_turno: "Retenido: sin turno ese día",
  retenido_error: "Retenido: la derivación falló",
};
