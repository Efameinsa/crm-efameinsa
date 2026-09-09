import { describe, expect, it } from "vitest";
import { dominioDeCorreo } from "./coincidencias-bandeja";

// El caso que lo hizo existir: el 09-09 un contacto de Google Ads llegó con
// `aseguramientocalidad@candelaperu.net` y sin RUC. CANDELA PERÚ ya era cliente
// de C4 con el contacto `monica.soto@candelaperu.net`, pero como el cruce
// comparaba el correo COMPLETO, el aviso no salió y quedaron dos fichas del
// mismo cliente.
describe("dominioDeCorreo", () => {
  it("reconoce la empresa por el dominio corporativo", () => {
    expect(dominioDeCorreo("aseguramientocalidad@candelaperu.net")).toBe("candelaperu.net");
    expect(dominioDeCorreo("MONICA.SOTO@CandelaPeru.NET")).toBe("candelaperu.net");
    expect(dominioDeCorreo("  ventas@nessushoteles.com.pe ")).toBe("nessushoteles.com.pe");
  });

  it("descarta los correos personales: unirían clientes que no tienen nada que ver", () => {
    // En la base hay 3.932 contactos con Gmail y 1.625 con Hotmail.
    for (const correo of [
      "juan@gmail.com",
      "juan@hotmail.com",
      "juan@outlook.es",
      "juan@yahoo.com",
      "juan@icloud.com",
      "algo@example.com",
    ]) {
      expect(dominioDeCorreo(correo)).toBeNull();
    }
  });

  it("no inventa dominio cuando no hay correo válido", () => {
    expect(dominioDeCorreo(null)).toBeNull();
    expect(dominioDeCorreo(undefined)).toBeNull();
    expect(dominioDeCorreo("")).toBeNull();
    expect(dominioDeCorreo("no-es-un-correo")).toBeNull();
    expect(dominioDeCorreo("falta@dominio")).toBeNull();
  });
});
