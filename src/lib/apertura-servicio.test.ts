import { describe, it, expect } from "vitest";
import {
  TIPOS_APERTURA,
  tituloDe,
  tipoSugerido,
  horaAmPm,
  filasApertura,
  asuntoApertura,
  cuerpoApertura,
  faltantesApertura,
  type DatosApertura,
} from "./apertura-servicio";

/**
 * Las tres aperturas reales que mandó Lesly el 05-09 se usan como referencia:
 * si el CRM las arma igual, el formato está bien.
 */

const MOTORGAS: DatosApertura = {
  tipo: "entrega",
  empresa: "CORPORACION EFAMEINSA",
  cliente: "MOTORGAS MULTISERVICIOS SAC",
  ruc: "20452702119",
  equipo: "SECADORA\nMARCA: LG\nMODELO: TITAN C\nCAPACIDAD: 15 KG",
  serie: "805KWAT2Y128",
  nota: "se solicita 01 guía para la entrega del equipo",
  direccion: "EN NUESTRAS INSTALACIONES",
  direccionFinal: "LOTE 14 TOMA DE BAUTISTA GROCIO PRADO – CHINCHA - ICA",
  fecha: "2026-08-25",
  hora: "11:00 AM",
  recibeNombre: "Felix Alejandro Reyes Ortiz",
  recibeDoc: "43538088",
  recibeTelefono: "904895898",
  tecnico: null,
  transporte: "TRANSPORTE CONTRATADO POR EL CLIENTE",
};

const PERU_VACATION: DatosApertura = {
  ...MOTORGAS,
  tipo: "entrega_puesta_marcha",
  cliente: "PERU VACATION RENTALS SAC",
  ruc: "20600869982",
  equipo: "SECADORA SEMI INDUSTRIAL A GAS APILABLE\nMARCA: LG\nMODELO: TITAN LIGHT\nCAPACIDAD: 15 KG",
  serie: "507KWFN22715",
  direccion: "Calle Bolívar 150 Miraflores",
  direccionFinal: null,
  fecha: "2026-08-18",
  hora: "08:00 AM",
  recibeNombre: "ANA CARDENAS",
  recibeDoc: null,
  recibeTelefono: "996 155 115",
  tecnico: "CRISTHIAN",
  transporte: "TRANSPORTE CONTRATADO",
};

const MERCEDARIAS: DatosApertura = {
  ...PERU_VACATION,
  tipo: "mantenimiento",
  empresa: "OPEN INVESTMENTS",
  cliente: "CONGREGACION DE RELIGIOSAS MERCEDARIAS MISIONERAS",
  ruc: "20138427014",
  equipo: "LAVADORA SEMI INDUSTRIAL\nMARCA: LG\nMODELO: TITAN C\nCAPACIDAD: 15 KG",
  serie: "804KWCF35059",
  nota: "Se solicita una guía para traslado de repuestos para posible venta",
  direccion: "BARRIOS ALTOS JR MAYNAS 500 CERCADO DE LIMA",
  fecha: "2026-09-02",
  recibeNombre: "SUSANA PELAEZ",
  recibeTelefono: "945648213",
  tecnico: "CRISTIAN DOLORIER",
};

describe("los tres formatos son el mismo, y solo cambia el encabezado", () => {
  it("cada tipo pone su propio título en la fila 1", () => {
    expect(tituloDe("entrega")).toBe("ENTREGA DE:");
    expect(tituloDe("entrega_puesta_marcha")).toBe("ENTREGA Y PUESTA EN MARCHA DE:");
    expect(tituloDe("mantenimiento")).toBe("SERVICIO DE MANTENIMIENTO:");
  });

  it("el resto de las filas no cambia entre formatos", () => {
    const a = filasApertura(MOTORGAS).slice(1);
    const b = filasApertura({ ...MOTORGAS, tipo: "mantenimiento" }).slice(1);
    expect(a).toEqual(b);
  });

  it("son exactamente nueve filas, y las dos últimas son del formato", () => {
    const filas = filasApertura(PERU_VACATION);
    expect(filas).toHaveLength(9);
    expect(filas[7].informacion).toBe("Gestión de Contabilidad");
    expect(filas[8].informacion).toBe("Gestión de Contabilidad");
  });
});

describe("el asunto del correo", () => {
  it("es EMPRESA // APERTURA DE SERVICIO // CLIENTE", () => {
    expect(asuntoApertura(MERCEDARIAS)).toBe(
      "OPEN INVESTMENTS // APERTURA DE SERVICIO // CONGREGACION DE RELIGIOSAS MERCEDARIAS MISIONERAS",
    );
    expect(asuntoApertura(PERU_VACATION)).toBe(
      "CORPORACION EFAMEINSA // APERTURA DE SERVICIO // PERU VACATION RENTALS SAC",
    );
  });
});

describe("las nueve filas llevan lo que el correo lleva", () => {
  it("la fila 1 junta el encabezado, el equipo, la serie y la nota entre paréntesis", () => {
    const [primera] = filasApertura(MERCEDARIAS);
    expect(primera.descripcion).toBe("APERTURA DE SERVICIO");
    expect(primera.informacion).toContain("SERVICIO DE MANTENIMIENTO:");
    expect(primera.informacion).toContain("MODELO: TITAN C");
    expect(primera.informacion).toContain("Serie: 804KWCF35059");
    expect(primera.informacion).toContain("(Se solicita una guía para traslado de repuestos para posible venta)");
    expect(primera.observaciones).toBe("08:00 AM");
  });

  it("el cliente va con su RUC", () => {
    expect(filasApertura(MOTORGAS)[1].informacion).toBe("MOTORGAS MULTISERVICIOS SAC\nRUC: 20452702119");
  });

  it("cuando la entrega es en nuestras instalaciones, agrega la dirección final", () => {
    const direccion = filasApertura(MOTORGAS)[2].informacion;
    expect(direccion).toContain("EN NUESTRAS INSTALACIONES");
    expect(direccion).toContain("DIRECCIÓN FINAL: LOTE 14 TOMA DE BAUTISTA GROCIO PRADO – CHINCHA - ICA");
  });

  it("sin dirección final, la fila 3 es solo la dirección", () => {
    expect(filasApertura(PERU_VACATION)[2].informacion).toBe("Calle Bolívar 150 Miraflores");
  });

  it("el día va en formato peruano", () => {
    expect(filasApertura(MOTORGAS)[3].informacion).toBe("25/08/2026");
  });

  it("quien recibe va con DNI y celular cuando se tienen", () => {
    expect(filasApertura(MOTORGAS)[4].informacion).toBe("Felix Alejandro Reyes Ortiz\nDNI: 43538088\nCel: 904895898");
    expect(filasApertura(PERU_VACATION)[4].informacion).toBe("ANA CARDENAS\nCel: 996 155 115");
  });

  it("lo que falta se marca, no se inventa", () => {
    expect(filasApertura(MOTORGAS)[5].informacion).toBe("—");
  });
});

describe("qué formato corresponde", () => {
  it("mantenimiento lo delata el tipo de servicio o el equipo", () => {
    expect(tipoSugerido({ tipo_servicio: "Mantenimiento" })).toBe("mantenimiento");
    expect(tipoSugerido({ tipo_servicio: "SERVICIO", equipo: "MANTENIMIENTO PREVENTIVO DE LAVADORA" })).toBe("mantenimiento");
  });

  it("si va por agencia, es una entrega a secas: no va nadie a instalar", () => {
    expect(tipoSugerido({ tipo_servicio: "ENTREGA DE EQUIPO", ubicacion: "ROMA CARGO O MARVISUR" })).toBe("entrega");
    expect(tipoSugerido({ tipo_servicio: "Venta de equipo", ubicacion: "Agencia Shalom Chincha" })).toBe("entrega");
  });

  it("lo demás se propone como entrega y puesta en marcha", () => {
    expect(tipoSugerido({ tipo_servicio: "Venta de equipo", ubicacion: "Calle Bolívar 150 Miraflores" })).toBe(
      "entrega_puesta_marcha",
    );
  });
});

describe("la hora se escribe como en el correo", () => {
  it("convierte la hora de la base a 12 horas", () => {
    expect(horaAmPm("08:00:00")).toBe("08:00 AM");
    expect(horaAmPm("11:00:00")).toBe("11:00 AM");
    expect(horaAmPm("14:30:00")).toBe("02:30 PM");
    expect(horaAmPm("00:15:00")).toBe("12:15 AM");
    expect(horaAmPm("12:00:00")).toBe("12:00 PM");
    expect(horaAmPm(null)).toBeNull();
  });
});

describe("avisa qué falta antes de mandarlo", () => {
  it("no pide técnico cuando el equipo va por agencia", () => {
    expect(faltantesApertura(MOTORGAS)).toEqual([]);
  });

  it("sí lo pide cuando alguien tiene que ir", () => {
    expect(faltantesApertura({ ...MOTORGAS, tipo: "entrega_puesta_marcha" })).toContain("el técnico asignado");
  });

  it("enumera lo que está vacío", () => {
    const faltan = faltantesApertura({ ...PERU_VACATION, fecha: null, hora: null, recibeTelefono: null });
    expect(faltan).toContain("el día del servicio");
    expect(faltan).toContain("la hora");
    expect(faltan).toContain("el teléfono de quien recibe");
  });
});

describe("el correo listo para pegar", () => {
  it("abre como los de Lesly y trae las nueve filas numeradas", () => {
    const cuerpo = cuerpoApertura(MERCEDARIAS);
    expect(cuerpo).toContain("Buen día Estimados,");
    expect(cuerpo).toContain("en coordinación con el Ing. Carlos");
    for (let n = 1; n <= 9; n++) expect(cuerpo).toMatch(new RegExp(`^${n}\\. `, "m"));
    expect(cuerpo).toContain("SERVICIO DE MANTENIMIENTO:");
    expect(cuerpo).toContain("[08:00 AM]");
    expect(cuerpo).toContain("RUC: 20138427014");
  });

  it("hay un formato por cada uno de los tres casos que describió Lesly", () => {
    expect(TIPOS_APERTURA.map((t) => t.clave)).toEqual(["entrega", "entrega_puesta_marcha", "mantenimiento"]);
  });
});
