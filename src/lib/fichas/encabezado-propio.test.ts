import { describe, expect, it } from "vitest";
// El lector es .mjs y sin tipos a propósito: lo comparten el CRM y los
// scripts del servidor, que corren en Node pelado.
import { leerFichaDeXml } from "./ficha-docx.mjs";

/**
 * El encabezado de la ficha NO tiene una lista cerrada de rótulos.
 *
 * Santos, 09-09, con la MESA VAPORIZADORA EFALMV2000 en la mano: «no le deja
 * editar dimensión de mesa ni el resto de cosas de su encabezado». Y era
 * cierto: el lector conocía seis rótulos —marca, modelo, capacidad,
 * calentamiento, panel, controles— y TIRABA EN SILENCIO todo lo demás. De ese
 * Word se perdían «Potencia», «Dimensión de mesa» y «Presión de trabajo», o
 * sea la mitad de lo que describe al equipo.
 *
 * Este XML reproduce la tabla del Word real: los rótulos en una fila y los
 * valores en la de abajo, que es como Efameinsa arma sus fichas.
 */
const celda = (t: string) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
const fila = (celdas: string[]) => `<w:tr>${celdas.map(celda).join("")}</w:tr>`;
const XML_MESA = `<w:document><w:body><w:tbl>
${fila(["Marca", "Modelo", "Potencia", "Controles", "Dimensión de mesa", "Presión de trabajo"])}
${fila(["EFAMEIN", "EFALMV2000", "2 HP", "220V. 60 Hz. Trifásico", "900mm x 2000mm.", "50-80 PSI"])}
</w:tbl></w:body></w:document>`;

describe("el encabezado admite los rótulos propios de cada familia", () => {
  it("rescata los seis conocidos Y los que no lo son", () => {
    const { cabecera } = leerFichaDeXml(XML_MESA) as {
      cabecera: { marca?: string; modelo?: string; controles?: string; extra: { rotulo: string; valor: string }[] };
    };
    expect(cabecera.marca).toBe("EFAMEIN");
    expect(cabecera.modelo).toBe("EFALMV2000");
    expect(cabecera.controles).toBe("220V. 60 Hz. Trifásico");

    const propios = Object.fromEntries(cabecera.extra.map((x) => [x.rotulo, x.valor]));
    expect(propios["Potencia"]).toBe("2 HP");
    expect(propios["Dimensión de mesa"]).toBe("900mm x 2000mm.");
    expect(propios["Presión de trabajo"]).toBe("50-80 PSI");
  });

  it("no mete en «extra» lo que ya tiene su casilla", () => {
    const { cabecera } = leerFichaDeXml(XML_MESA) as { cabecera: { extra: { rotulo: string }[] } };
    const rotulos = cabecera.extra.map((x) => x.rotulo.toLowerCase());
    expect(rotulos).not.toContain("marca");
    expect(rotulos).not.toContain("modelo");
    expect(rotulos).not.toContain("controles");
    // Tres columnas propias, ni una más: si aparecieran las conocidas
    // saldrían DOS VECES en la hoja impresa.
    expect(cabecera.extra).toHaveLength(3);
  });

  it("una ficha de lavadora normal no gana casillas propias", () => {
    const xml = `<w:document><w:body><w:tbl>
${fila(["Marca", "Modelo", "Capacidad", "Calentamiento", "Panel", "Controles"])}
${fila(["UNIMAC", "UW60", "27 KG", "VAPOR", "Digital", "220V"])}
</w:tbl></w:body></w:document>`;
    const { cabecera } = leerFichaDeXml(xml) as { cabecera: { capacidad?: string; extra: unknown[] } };
    expect(cabecera.capacidad).toBe("27 KG");
    expect(cabecera.extra).toHaveLength(0);
  });
});
