import { describe, expect, it } from "vitest";
import { cabeceraArchivo, textoParaNombreArchivo } from "./nombre-archivo";

// Las razones sociales de las pruebas salen de la cartera real: son las que
// tienen caracteres que Windows no admite.

describe("textoParaNombreArchivo", () => {
  it("deja intacto un nombre normal", () => {
    expect(textoParaNombreArchivo("Presu_2195-26, WAYRA INMOBILIARIA")).toBe(
      "Presu_2195-26, WAYRA INMOBILIARIA",
    );
  });

  it("cambia la barra por un guion sin pegar las palabras", () => {
    expect(textoParaNombreArchivo("BEAR CREEK MINING S.A.C. / MINA CORANI")).toBe(
      "BEAR CREEK MINING S.A.C. - MINA CORANI",
    );
    expect(textoParaNombreArchivo("JHONATAN /LAVANDERIA JAC CLEAN")).toBe("JHONATAN - LAVANDERIA JAC CLEAN");
  });

  it("quita las comillas y los asteriscos", () => {
    expect(textoParaNombreArchivo('HOSTAL "LA JOYA"')).toBe("HOSTAL - LA JOYA");
    expect(textoParaNombreArchivo("ARIAS BLANCA - *EMMA* LOGISTICA")).toBe("ARIAS BLANCA - EMMA - LOGISTICA");
  });

  it("no deja que termine en punto ni en espacio", () => {
    expect(textoParaNombreArchivo("INDUSTRIAS DEL TULUMAYO S.A.  ")).toBe("INDUSTRIAS DEL TULUMAYO S.A");
  });

  it("recorta lo muy largo y avisa con puntos suspensivos", () => {
    const largo = textoParaNombreArchivo(`Presu_2195-26, ${"A".repeat(200)}`);
    expect(largo.length).toBeLessThanOrEqual(91);
    expect(largo.endsWith("…")).toBe(true);
  });

  it("con texto vacío devuelve vacío en vez de reventar", () => {
    expect(textoParaNombreArchivo("   ")).toBe("");
  });
});

describe("cabeceraArchivo", () => {
  it("manda el nombre dos veces: sin tildes y en UTF-8", () => {
    const c = cabeceraArchivo("Presu_2195-26, Nataly Ludeña gallardo");
    expect(c).toContain('filename="Presu_2195-26, Nataly Ludena gallardo.pdf"');
    expect(c).toContain("filename*=UTF-8''");
    expect(decodeURIComponent(c.split("filename*=UTF-8''")[1])).toBe(
      "Presu_2195-26, Nataly Ludeña gallardo.pdf",
    );
  });

  it("el respaldo ASCII nunca lleva comillas que rompan la cabecera", () => {
    const c = cabeceraArchivo('Presu_1-26, HOSTAL "LA JOYA"');
    const ascii = c.split('filename="')[1].split('"')[0];
    expect(ascii).not.toContain('"');
    expect(ascii).toBe("Presu_1-26, HOSTAL - LA JOYA.pdf");
  });

  it("si el nombre queda vacío, igual devuelve algo abrible", () => {
    expect(cabeceraArchivo("")).toContain('filename="documento.pdf"');
  });
});
