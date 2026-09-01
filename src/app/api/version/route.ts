/**
 * ¿Qué versión está sirviendo el servidor AHORA?
 *
 * Existe para la pastilla «Hay una versión nueva» (31-08): cada pestaña
 * abierta lleva grabada la versión con la que nació y le pregunta a esta ruta
 * si el servidor ya es otro. En Vercel la versión es el commit del
 * despliegue; en local, «dev» (nunca difiere: el dev server ya recarga solo).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { version: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
