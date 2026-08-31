import { redirect } from "next/navigation";

/**
 * «Soporte técnico» pasó a llamarse «Casos» el 27-08, y «Casos» se unificó
 * con Atenciones el 31-08 (plan 23). La ruta vieja sigue existiendo y
 * redirige directo al destino final — hay enlaces sueltos en notificaciones y
 * en el navegador de quien la abre todos los días, y romperlos no le agrega
 * nada a nadie.
 */
export default function SoporteRedirigeAAtenciones() {
  redirect("/postventa/atenciones?ver=casos");
}
