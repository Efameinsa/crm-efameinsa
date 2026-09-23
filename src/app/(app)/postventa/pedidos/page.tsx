import { redirect } from "next/navigation";

/**
 * /postventa/pedidos nunca tuvo lista propia: la lista de pedidos es
 * /postventa/control. Un enlace viejo que llegue acá va a la lista en vez de
 * dar 404 (Santos, 23-09, desde «El día del área»).
 */
export default function PedidosPostventaPage() {
  redirect("/postventa/control");
}
