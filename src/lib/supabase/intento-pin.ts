/**
 * Anota los códigos de autorización equivocados (0424).
 *
 * Las funciones de la base que validan el código anotan el intento fallido y
 * enseguida lanzan el error; el error deshace la anotación, así que el tope de
 * 5 intentos cada 10 minutos nunca funcionó (09-10, Brenda). Postgres no tiene
 * cómo guardar algo dentro de una transacción que se deshace, de modo que se
 * anota acá, en una segunda llamada con la misma sesión, cuando la respuesta
 * de una RPC trae uno de esos rechazos.
 *
 * Los mensajes son los que dejan fila en intentos_pin_supervisor; «ya se usó»
 * no cuenta (el código era bueno).
 */
const RECHAZOS = [
  "El código de autorización son cuatro dígitos",
  "El código no es válido o ya venció",
  "Código incorrecto o vencido",
];

export function fetchAnotaPinFallido(base: typeof fetch): typeof fetch {
  const envuelto = async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const respuesta = await base(entrada, init);
    if (respuesta.ok || respuesta.status < 400 || respuesta.status >= 500) return respuesta;
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.toString() : entrada.url;
    const i = url.indexOf("/rest/v1/rpc/");
    if (i < 0) return respuesta;
    try {
      const cuerpo = await respuesta.clone().text();
      if (!RECHAZOS.some((r) => cuerpo.includes(r))) return respuesta;
      // Mismas cabeceras (apikey + Authorization de quien está en sesión).
      const cabeceras = new Headers(init?.headers ?? (entrada instanceof Request ? entrada.headers : undefined));
      cabeceras.set("Content-Type", "application/json");
      await base(url.slice(0, i) + "/rest/v1/rpc/anotar_intento_pin_fallido", {
        method: "POST",
        headers: cabeceras,
        body: "{}",
      });
    } catch {
      // Anotar es un extra: si falla, el error original sigue su camino igual.
    }
    return respuesta;
  };
  return envuelto as typeof fetch;
}
