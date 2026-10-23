import { describe, expect, it } from "vitest";
import { conQuienEscribe, lineaQuienEscribe } from "./quien-escribe";

const ego = { nombre_contacto: "Ego Gomero", razon_social: null, telefono: "+51972842887", email: "egomero27@gmail.com" };

describe("quién escribió (buzón cd7ed2a1)", () => {
  it("arma la línea con nombre, teléfono y correo", () => {
    expect(lineaQuienEscribe(ego)).toBe("Escribió: Ego Gomero · tel. +51972842887 · egomero27@gmail.com");
  });

  it("la pone delante del mensaje del formulario", () => {
    expect(conQuienEscribe("El cliente volvió a escribir: «City: Huarmey»", ego)).toBe(
      "Escribió: Ego Gomero · tel. +51972842887 · egomero27@gmail.com. El cliente volvió a escribir: «City: Huarmey»",
    );
  });

  it("no la repite si Central ya escribió el teléfono o si viene del diálogo", () => {
    expect(conQuienEscribe("Llamar a Ego al 972 842 887, quiere precio", ego)).toBe("Llamar a Ego al 972 842 887, quiere precio");
    const delDialogo = conQuienEscribe("El cliente volvió a escribir.", ego);
    expect(conQuienEscribe(delDialogo, ego)).toBe(delDialogo);
  });

  it("sin datos del contacto deja el texto como está", () => {
    expect(conQuienEscribe("atenderlo plis, urgente", null)).toBe("atenderlo plis, urgente");
    expect(lineaQuienEscribe({})).toBeNull();
  });
});
