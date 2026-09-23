import { cookies, headers } from "next/headers";
import { CABECERA_DEMO, COOKIE_VISTA } from "@/lib/solo-lectura";

/** Si quien mira es una cuenta de demostración con la vista nueva puesta (la misma regla que (app)/layout.tsx). */
export async function enVistaNueva(): Promise<boolean> {
  const [cabeceras, tarro] = await Promise.all([headers(), cookies()]);
  return Boolean(cabeceras.get(CABECERA_DEMO)) && tarro.get(COOKIE_VISTA)?.value !== "actual";
}
