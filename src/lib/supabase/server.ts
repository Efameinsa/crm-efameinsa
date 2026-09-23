import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { CABECERA_DEMO, fetchSoloLectura } from "@/lib/solo-lectura";
import { galletasDelEspejo } from "@/lib/supabase/espejo";

// Cliente para Server Components / Server Actions / Route Handlers.
// En Server Components la escritura de cookies falla silenciosamente a propósito:
// el middleware es quien refresca la sesión en esos casos.
export async function createClient() {
  // CUENTA DE DEMOSTRACIÓN (0280): lee con la sesión de la cuenta original y
  // no puede escribir. La cabecera la pone solo el proxy (y la borra si viene
  // del navegador), así que ningún usuario normal pasa por acá.
  const demoId = (await headers()).get(CABECERA_DEMO);
  if (demoId) {
    const galletas = await galletasDelEspejo(demoId);
    if (!galletas) throw new Error("Esta cuenta de demostración no tiene cuenta original asignada.");
    const tarro = new Map(galletas.map((g) => [g.name, g.value]));
    return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => [...tarro].map(([name, value]) => ({ name, value })),
        setAll: (lista) => lista.forEach(({ name, value }) => tarro.set(name, value)),
      },
      global: { fetch: fetchSoloLectura() },
    });
  }
  return createClientReal();
}

/** La sesión de quien está en el navegador, sin espejo. Solo para cerrar la sesión de una cuenta de demostración. */
export async function createClientReal() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Llamado desde un Server Component — el middleware refresca la sesión.
          }
        },
      },
    },
  );
}
