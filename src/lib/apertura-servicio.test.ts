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
  entregaModo: null,
  agenciaDestino: null,
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

  it("son once filas: primer destino y destino final separados (Lesly, 02-10)", () => {
    const filas = filasApertura(PERU_VACATION);
    expect(filas).toHaveLength(11);
    expect(filas.map((f) => f.descripcion)).toEqual([
      "SERVICIO A REALIZAR",
      "CLIENTE",
      "PRIMER DESTINO",
      "DESTINO FINAL",
      "PROGRAMACIÓN",
      "PERSONA QUE RECIBE",
      "PERSONAL ASIGNADO PARA EL SERVICIO",
      "MEDIO DE TRANSPORTE PERSONAL TÉCNICO",
      "REQUISICIÓN POR MOVILIDAD (IDA Y VUELTA, REFERENCIA).",
      "MONTO DE VIÁTICOS",
      "COORDINACIÓN CON LOGÍSTICA",
    ]);
  });

  it("con quién se coordina se escribe; ya no es «Sara Campos» fijo (Lesly, 02-10)", () => {
    const filas = filasApertura({ ...PERU_VACATION, coordinaContabilidad: "Jhon Kalsin Sulca" });
    expect(filas[8]).toMatchObject({ informacion: "Gestión de Contabilidad", observaciones: "Jhon Kalsin Sulca" });
    expect(filas[9]).toMatchObject({ informacion: "Gestión de Contabilidad", observaciones: "Jhon Kalsin Sulca" });
    expect(filas[10]).toMatchObject({ informacion: "Herramientas, repuestos traídos anteriormente y EPP", observaciones: "Almacén" });
    expect(filasApertura({ ...PERU_VACATION, coordinaLogistica: "Abdías · 987 654 321" })[10].observaciones).toBe("Abdías · 987 654 321");
    expect(filasApertura(PERU_VACATION)[8].observaciones).toBe("—");
    expect(faltantesApertura(PERU_VACATION)).toContain("con quién coordina contabilidad (movilidad y viáticos)");
    expect(faltantesApertura({ ...PERU_VACATION, coordinaContabilidad: "Jhon" })).not.toContain("con quién coordina contabilidad (movilidad y viáticos)");
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

describe("las filas llevan lo que el correo lleva", () => {
  it("la fila 1 junta el encabezado, el equipo y la serie; la nota va en NOTAS", () => {
    const [primera] = filasApertura(MERCEDARIAS);
    expect(primera.descripcion).toBe("SERVICIO A REALIZAR");
    expect(primera.informacion).toContain("SERVICIO DE MANTENIMIENTO:");
    expect(primera.informacion).toContain("MODELO: TITAN C");
    expect(primera.informacion).toContain("Serie: 804KWCF35059");
    expect(primera.informacion).not.toContain("guía");
    expect(primera.notas).toEqual(["Se solicita una guía para traslado de repuestos para posible venta"]);
    expect(primera.observaciones).toBe("08:00 AM");
  });

  it("la guía tiene su propio campo y sale primero en NOTAS (Lesly, 02-10)", () => {
    const base = { ...PERU_VACATION, nota: null };
    expect(filasApertura(base)[0].notas).toEqual([]);
    expect(filasApertura({ ...base, guia: "traslado" })[0].notas).toEqual(["SE SOLICITA GUÍA PARA EL TRASLADO DEL EQUIPO"]);
    expect(filasApertura({ ...base, guia: "materiales", guiaDetalle: "tubería de cobre" })[0].notas).toEqual([
      "SE SOLICITA GUÍA ADICIONAL PARA LLEVAR MATERIALES: TUBERÍA DE COBRE",
    ]);
    expect(filasApertura({ ...base, guia: "ambas", nota: "llamar antes" })[0].notas).toEqual([
      "SE SOLICITA GUÍA PARA EL TRASLADO DEL EQUIPO",
      "SE SOLICITA GUÍA ADICIONAL PARA LLEVAR MATERIALES",
      "llamar antes",
    ]);
    expect(cuerpoApertura({ ...base, guia: "traslado" })).toContain("NOTAS:\n   - SE SOLICITA GUÍA PARA EL TRASLADO DEL EQUIPO");
  });

  it("el cliente va con su RUC", () => {
    expect(filasApertura(MOTORGAS)[1].informacion).toBe("MOTORGAS MULTISERVICIOS SAC\nRUC: 20452702119");
  });

  it("cuando la entrega es en nuestras instalaciones, la dirección final es el destino final", () => {
    const filas = filasApertura(MOTORGAS);
    expect(filas[2].informacion).toBe("EN NUESTRAS INSTALACIONES");
    expect(filas[3].informacion).toBe("LOTE 14 TOMA DE BAUTISTA GROCIO PRADO – CHINCHA - ICA");
  });

  it("dice si la entrega es a domicilio o en agencia, y cuál (0259)", () => {
    const agencia = filasApertura({ ...MOTORGAS, entregaModo: "agencia", agenciaDestino: "Marvisur, agencia Cusco – Wanchaq" })[2].informacion;
    expect(agencia).toContain("AGENCIA Marvisur, agencia Cusco – Wanchaq");
    const domicilio = filasApertura({ ...PERU_VACATION, entregaModo: "domicilio" });
    expect(domicilio[2].informacion).toBe("ENTREGA A DOMICILIO\nCalle Bolívar 150 Miraflores");
    expect(domicilio[3].informacion).toBe("EL MISMO (se entrega directo al cliente)");
  });

  it("por agencia: la agencia es el primer destino y el cliente el destino final (0345; Lesly, 02-10)", () => {
    const d = { ...PERU_VACATION, entregaModo: "agencia" as const, agenciaDestino: "Marvisur, agencia Ica", agenciaDireccion: "Av. Paseo de la República 3570, San Isidro" };
    const filas = filasApertura(d);
    expect(filas[2].informacion).toBe("AGENCIA Marvisur, agencia Ica\nAv. Paseo de la República 3570, San Isidro");
    expect(filas[3].informacion).toBe("Calle Bolívar 150 Miraflores");
    expect(filas[3].resaltado ?? null).toBeNull();
    // Si la agencia lo lleva hasta el cliente, la nota resaltada del modelo.
    expect(filasApertura({ ...d, direccionFinal: "Abtao 951 – Hotel Brancaccio" })[3].resaltado).toBe("EQUIPO DEBERÁ LLEGAR A DOMICILIO");
    expect(filasApertura({ ...d, agenciaDestino: "AGENCIA SHALOM" })[2].informacion.startsWith("AGENCIA SHALOM\n")).toBe(true);
    expect(filasApertura({ ...d, agenciaDestino: "ANGENCIA MARVISUR" })[2].informacion.startsWith("ANGENCIA MARVISUR\n")).toBe(true);
    expect(faltantesApertura(d)).not.toContain("la dirección de la agencia (primer destino)");
    expect(faltantesApertura({ ...d, agenciaDireccion: null })).toContain("la dirección de la agencia (primer destino)");
  });

  it("no repite la dirección final si ya viene en la nota (ANDINAS, 30-09)", () => {
    const d = {
      ...PERU_VACATION,
      entregaModo: "agencia" as const,
      agenciaDestino: "ANGENCIA MARVISUR",
      agenciaDireccion: "Jr. Humboldt 460 - La Victoria",
      direccion: "NOTA: LA CLIENTE SOLICITA CON ENTREGA A DOMICILIO A NRO. 103 INT. D URB. SANTA MARIA DE SARAJA (ESPALDA CHIFA CENTRAL) ICA - ICA - ICA.",
      direccionFinal: "NRO. 103 INT. D URB. SANTA MARIA DE SARAJA (ESPALDA CHIFA CENTRAL) ICA - ICA - ICA",
    };
    expect(filasApertura(d)[3].informacion).not.toContain("SANTA MARIA DE SARAJA (ESPALDA CHIFA CENTRAL) ICA - ICA - ICA\nNRO.");
    expect(filasApertura({ ...d, direccionFinal: "Calle Otra 123, Pisco" })[3].informacion).toContain("Calle Otra 123, Pisco");
  });

  it("sin dirección final, el primer destino es solo la dirección", () => {
    expect(filasApertura(PERU_VACATION)[2].informacion).toBe("Calle Bolívar 150 Miraflores");
  });

  it("el día va en formato peruano", () => {
    expect(filasApertura(MOTORGAS)[4].informacion).toBe("25/08/2026");
  });

  it("quien recibe va con DNI y celular cuando se tienen", () => {
    expect(filasApertura(MOTORGAS)[5].informacion).toBe("Felix Alejandro Reyes Ortiz\nDNI: 43538088\nCel: 904895898");
    expect(filasApertura(PERU_VACATION)[5].informacion).toBe("ANA CARDENAS\nCel: 996 155 115");
  });

  it("lo que falta se marca, no se inventa", () => {
    expect(filasApertura(MOTORGAS)[6].informacion).toBe("—");
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
  it("abre como los de Lesly, trae las once filas numeradas y cierra con «Atentamente»", () => {
    const cuerpo = cuerpoApertura(MERCEDARIAS);
    expect(cuerpo).toMatch(/^(Buenos Días|Buenas Tardes|Buenas Noches) Estimados,/);
    expect(cuerpo).toContain("en coordinación con el Ing. Carlos");
    expect(cuerpo).toContain("se ha quedado en agenda el siguiente servicio:");
    expect(cuerpoApertura(MOTORGAS)).toContain("se ha quedado en agenda el siguiente despacho:");
    for (let n = 1; n <= 11; n++) expect(cuerpo).toMatch(new RegExp(`^${n}\\. `, "m"));
    expect(cuerpo.trimEnd().endsWith("Atentamente,")).toBe(true);
    expect(cuerpo).toContain("SERVICIO DE MANTENIMIENTO:");
    expect(cuerpo).toContain("[08:00 AM]");
    expect(cuerpo).toContain("RUC: 20138427014");
  });

  it("hay un formato por cada uno de los tres casos que describió Lesly", () => {
    expect(TIPOS_APERTURA.map((t) => t.clave)).toEqual(["entrega", "entrega_puesta_marcha", "mantenimiento"]);
  });
});
