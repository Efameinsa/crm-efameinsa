import { cookies, headers } from "next/headers";
import { CABECERA_DEMO, COOKIE_VISTA } from "@/lib/solo-lectura";

import { usaVistaNueva } from "@/lib/propuesta/regla-vista";

export { usaVistaNueva, VISTA_NUEVA_PARA_TODOS } from "@/lib/propuesta/regla-vista";

/** Si quien mira ve la vista nueva (la misma regla que (app)/layout.tsx). */
export async function enVistaNueva(): Promise<boolean> {
  const [cabeceras, tarro] = await Promise.all([headers(), cookies()]);
  return usaVistaNueva(Boolean(cabeceras.get(CABECERA_DEMO)), tarro.get(COOKIE_VISTA)?.value);
}
