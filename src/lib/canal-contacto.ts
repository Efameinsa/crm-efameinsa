// Etiquetas legibles de `canal_contacto` — compartido entre la server action de
// captura manual (Central) y los endpoints de ingesta automática (leads API),
// para que la notificación a gerencia diga siempre lo mismo sin importar el origen.
export const CANAL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  llamada: "Llamada",
  formulario_web: "Formulario web",
  facebook: "Facebook",
  instagram: "Instagram",
  email: "Correo",
  presencial: "Presencial",
  referido: "Referido",
  otro: "Otro",
};
