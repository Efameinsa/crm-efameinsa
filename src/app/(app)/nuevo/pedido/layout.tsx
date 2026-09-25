import { requerirPerfil } from "@/lib/auth";
import { guardaFichaPedido } from "@/lib/propuesta/guardas";

/** La misma regla que la ficha de siempre (auditoría 25-09); la página la repite (ver guardas.ts). */
export default async function Guarda({ children }: { children: React.ReactNode }) {
  guardaFichaPedido(await requerirPerfil());
  return <>{children}</>;
}
