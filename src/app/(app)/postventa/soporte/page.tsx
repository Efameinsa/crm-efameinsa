import { redirect } from "next/navigation";

/**
 * «Soporte técnico» pasó a llamarse «Casos» el 27-08, con la palabra que usa
 * Carlos y con la que Central ya deriva. La ruta vieja sigue existiendo y
 * redirige: hay enlaces sueltos en notificaciones y en el navegador de quien la
 * abre todos los días, y romperlos no le agrega nada a nadie.
 */
export default function SoporteRedirigeACasos() {
  redirect("/postventa/casos");
}
