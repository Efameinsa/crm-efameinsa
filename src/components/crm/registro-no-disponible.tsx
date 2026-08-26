import Link from "next/link";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Reemplaza el 404 en blanco de Next cuando un enlace (típicamente una
 * notificación vieja) apunta a un cliente o gestión que ya no se puede
 * mostrar.
 *
 * Pedido de Darwin el 26-08: a Ariana le llegó una notificación de "cliente
 * asignado" y al hacer clic le salía 404 sin explicación. La causa real tiene
 * dos caras y no se puede distinguir desde acá sin saltarse RLS (algo que el
 * propio cliente admin de Supabase prohíbe hacer en una Server Component que
 * atiende una request de usuario — ver la nota en lib/supabase/admin.ts): o
 * el cliente pasó a otra cartera por decisión de gerencia, o el registro se
 * depuró (duplicado fusionado, prueba borrada). En ambos casos el enlace
 * queda muerto y no es un error de quien hizo clic.
 */
export function RegistroNoDisponible({
  volverHref,
  volverTexto,
}: {
  volverHref: string;
  volverTexto: string;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 text-center shadow-sm">
      <Info className="mx-auto size-8 text-muted-foreground" />
      <h1 className="mt-3 text-base font-semibold text-foreground">Esto ya no se puede mostrar</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        El enlace apunta a un cliente o gestión que ya no está disponible para ti. O pasó a otra
        cartera por decisión de gerencia, o el registro se depuró del sistema (una prueba borrada o
        una ficha duplicada que se fusionó con otra). Si te parece que es un error, avísale a
        gerencia con el nombre del cliente.
      </p>
      <Button className="mt-4" render={<Link href={volverHref}>{volverTexto}</Link>} />
    </div>
  );
}
