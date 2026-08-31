import { redirect } from "next/navigation";

/**
 * «Casos» se unificó con Atenciones el 31-08 (plan 23): eran cuatro puertas al
 * mismo trabajo técnico con nombre distinto. La ruta vieja sigue existiendo y
 * redirige — hay enlaces sueltos en notificaciones y en el navegador de quien
 * la abre todos los días, y romperlos no le agrega nada a nadie (mismo patrón
 * que `/postventa/soporte`).
 */
export default function CasosRedirigeAAtenciones() {
  redirect("/postventa/atenciones?ver=casos");
}
