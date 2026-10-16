import { describe, it, expect } from "vitest";
import {
  limpiarObsFilas,
  notaDestinoAutomatica,
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
    expect(tituloDe("puesta_marcha")).toBe("PUESTA EN MARCHA DE:");
  });

  it("solo puesta en marcha: el técnico va sin equipo y queda en agenda un servicio (Rubí, 05-10)", () => {
    const d = { ...PERU_VACATION, tipo: "puesta_marcha" as const };
    expect(filasApertura(d)[0].informacion.startsWith("PUESTA EN MARCHA DE:")).toBe(true);
    expect(cuerpoApertura(d)).toContain("el siguiente servicio:");
    expect(faltantesApertura({ ...d, tecnico: null })).toContain("el técnico asignado");
  });

  it("el resto de las filas no cambia entre formatos", () => {
    const a = filasApertura(MOTORGAS).slice(1);
    const b = filasApertura({ ...MOTORGAS, tipo: "mantenimiento" }).slice(1);
    expect(a).toEqual(b);
  });

  it("son doce filas: la orden en la 2 (Rubí, 16-10), primer destino y destino final separados (Lesly, 02-10)", () => {
    const filas = filasApertura(PERU_VACATION);
    expect(filas).toHaveLength(12);
    expect(filas.map((f) => f.descripcion)).toEqual([
      "SERVICIO A REALIZAR",
      "ORDEN DE COMPRA / SERVICIO",
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
    expect(filas[9]).toMatchObject({ informacion: "Gestión de Contabilidad", observaciones: "Jhon Kalsin Sulca" });
    expect(filas[10]).toMatchObject({ informacion: "Gestión de Contabilidad", observaciones: "Jhon Kalsin Sulca" });
    expect(filas[11]).toMatchObject({ informacion: "Herramientas, repuestos traídos anteriormente y EPP", observaciones: "Almacén" });
    expect(filasApertura({ ...PERU_VACATION, coordinaLogistica: "Abdías · 987 654 321" })[11].observaciones).toBe("Abdías · 987 654 321");
    expect(filasApertura(PERU_VACATION)[9].observaciones).toBe("—");
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
    expect(filasApertura({ ...base, guia: "traslado" })[0].notas).toEqual(["SE SOLICITA GUÍA DE SALIDA DEL EQUIPO"]);
    expect(filasApertura({ ...base, guia: "materiales", guiaDetalle: "tubería de cobre" })[0].notas).toEqual([
      "SE SOLICITA GUÍA ADICIONAL PARA LLEVAR MATERIALES: TUBERÍA DE COBRE",
    ]);
    expect(filasApertura({ ...base, guia: "ambas", nota: "llamar antes" })[0].notas).toEqual([
      "SE SOLICITA GUÍA DE SALIDA DEL EQUIPO",
      "SE SOLICITA GUÍA ADICIONAL PARA LLEVAR MATERIALES",
      "llamar antes",
    ]);
    expect(filasApertura({ ...base, guia: "repuestos", guiaDetalle: "manómetro (posible venta)" })[0].notas).toEqual([
      "SE SOLICITA GUÍA DE SALIDA DE REPUESTOS: MANÓMETRO (POSIBLE VENTA)",
    ]);
    expect(cuerpoApertura({ ...base, guia: "traslado" })).toContain("NOTAS:\n   - SE SOLICITA GUÍA DE SALIDA DEL EQUIPO");
  });

  it("el cliente va con su RUC", () => {
    expect(filasApertura(MOTORGAS)[2].informacion).toBe("MOTORGAS MULTISERVICIOS SAC\nRUC: 20452702119");
  });

  it("cuando la entrega es en nuestras instalaciones, la dirección final es el destino final", () => {
    const filas = filasApertura(MOTORGAS);
    expect(filas[3].informacion).toBe("EN NUESTRAS INSTALACIONES");
    expect(filas[4].informacion).toBe("LOTE 14 TOMA DE BAUTISTA GROCIO PRADO – CHINCHA - ICA");
  });

  it("dice si la entrega es a domicilio o en agencia, y cuál (0259)", () => {
    const agencia = filasApertura({ ...MOTORGAS, entregaModo: "agencia", agenciaDestino: "Marvisur, agencia Cusco – Wanchaq" })[3].informacion;
    expect(agencia).toContain("AGENCIA Marvisur, agencia Cusco – Wanchaq");
    const domicilio = filasApertura({ ...PERU_VACATION, entregaModo: "domicilio" });
    expect(domicilio[3].informacion).toBe("ENTREGA A DOMICILIO\nCalle Bolívar 150 Miraflores");
    expect(domicilio[4].informacion).toBe("EL MISMO (se entrega directo al cliente)");
  });

  it("por agencia: la agencia es el primer destino y el cliente el destino final (0345; Lesly, 02-10)", () => {
    const d = { ...PERU_VACATION, entregaModo: "agencia" as const, agenciaDestino: "Marvisur, agencia Ica", agenciaDireccion: "Av. Paseo de la República 3570, San Isidro" };
    const filas = filasApertura(d);
    expect(filas[3].informacion).toBe("AGENCIA Marvisur, agencia Ica\nAv. Paseo de la República 3570, San Isidro");
    expect(filas[4].informacion).toBe("Calle Bolívar 150 Miraflores");
    // Si la agencia lo lleva hasta el cliente, la nota del modelo (en observaciones).
    expect(filasApertura({ ...d, direccionFinal: "Abtao 951 – Hotel Brancaccio" })[4].informacion).toBe("Calle Bolívar 150 Miraflores\nAbtao 951 – Hotel Brancaccio");
    expect(filasApertura({ ...d, direccionFinal: "Abtao 951 – Hotel Brancaccio" })[4].observaciones).toBe("EQUIPO DEBERÁ LLEGAR A DOMICILIO");
    expect(filasApertura({ ...d, agenciaDestino: "AGENCIA SHALOM" })[3].informacion.startsWith("AGENCIA SHALOM\n")).toBe(true);
    expect(filasApertura({ ...d, agenciaDestino: "ANGENCIA MARVISUR" })[3].informacion.startsWith("ANGENCIA MARVISUR\n")).toBe(true);
    expect(faltantesApertura(d)).not.toContain("la dirección de la agencia (primer destino)");
    expect(faltantesApertura({ ...d, agenciaDireccion: null })).toContain("la dirección de la agencia (primer destino)");
  });

  it("el horario de atención de la agencia sale en el primer destino y se pide (0505; Lesly, 15-10)", () => {
    const d = { ...PERU_VACATION, entregaModo: "agencia" as const, agenciaDestino: "Marvisur, agencia Ica", agenciaDireccion: "Av. Paseo de la República 3570, San Isidro" };
    expect(faltantesApertura(d)).toContain("el horario de atención de la agencia (en «Dirección y quién recibe»)");
    const con = { ...d, agenciaHorario: " L-V 8:00 a 18:00 · Sáb 8:00 a 13:00 " };
    expect(filasApertura(con)[3].informacion.split("\n")).toEqual([
      "AGENCIA Marvisur, agencia Ica",
      "Av. Paseo de la República 3570, San Isidro",
      "HORARIO DE ATENCIÓN: L-V 8:00 a 18:00 · Sáb 8:00 a 13:00",
    ]);
    expect(faltantesApertura(con).some((f) => f.includes("horario"))).toBe(false);
    // A domicilio no se pide.
    expect(faltantesApertura({ ...PERU_VACATION, entregaModo: "domicilio" }).some((f) => f.includes("horario"))).toBe(false);
  });

  it("las observaciones de las filas se escriben a mano (Rubí, 12-10; 0445)", () => {
    const f = filasApertura({ ...PERU_VACATION, obsFilas: { "6": "  Si no está, recibe el Sr. Pérez ", "2": "", "4": "no va", "11": "no va" } });
    expect(f[6].observaciones).toBe("Si no está, recibe el Sr. Pérez");
    expect(f[2].observaciones).toBe("");
    // Solo las filas sin campo propio: destino final y logística tienen los suyos.
    expect(f[4].observaciones).not.toContain("no va");
    expect(f[11].observaciones).not.toContain("no va");
    expect(cuerpoApertura({ ...PERU_VACATION, obsFilas: { "6": "Llamar antes" } })).toContain("7. PERSONA QUE RECIBE   [Llamar antes]");
    expect(limpiarObsFilas({ "2": " ", "6": "x" })).toEqual({ "6": "x" });
    expect(limpiarObsFilas({ "2": " " })).toBeNull();
  });

  it("la NOTA del destino final se cambia o se quita (Rubí, 12-10; 0438)", () => {
    const d = { ...PERU_VACATION, entregaModo: "agencia" as const, agenciaDestino: "EXPRESO LOS CHANKAS", agenciaDireccion: "Jr. Luna Pizarro 459 - La Victoria", direccionFinal: "Av. José María Arguedas 112 - Andahuaylas" };
    const base = "Calle Bolívar 150 Miraflores\nAv. José María Arguedas 112 - Andahuaylas";
    // En la columna de observaciones (Rubí, 12-10); la información queda solo con las direcciones.
    expect(filasApertura({ ...d, destinoNota: null })[4].informacion).toBe(base);
    expect(filasApertura({ ...d, destinoNota: null })[4].observaciones).toBe("EQUIPO DEBERÁ LLEGAR A DOMICILIO");
    expect(filasApertura({ ...d, destinoNota: "  EL CLIENTE RECOGE EN LA AGENCIA DE ANDAHUAYLAS " })[4].observaciones).toBe("EL CLIENTE RECOGE EN LA AGENCIA DE ANDAHUAYLAS");
    expect(filasApertura({ ...d, destinoNota: "" })[4].observaciones).toBe("");
    // Debajo de la observación del destino, si la hay.
    expect(filasApertura({ ...d, destinoNota: "LLAMAR 1 HORA ANTES", destinoObservacion: "Sede Andahuaylas" })[4].observaciones).toBe("Sede Andahuaylas\nLLAMAR 1 HORA ANTES");
    // Sin resaltar (Rubí, 12-10): no en amarillo.
    expect(filasApertura({ ...d, destinoNota: null })[4].resaltado ?? null).toBeNull();
    // También a domicilio, donde antes no había nota.
    expect(filasApertura({ ...PERU_VACATION, entregaModo: "domicilio", destinoNota: "LLAMAR 1 HORA ANTES" })[4].observaciones).toBe("LLAMAR 1 HORA ANTES");
    expect(cuerpoApertura({ ...d, destinoNota: "LLAMAR 1 HORA ANTES" })).toContain("5. DESTINO FINAL   [LLAMAR 1 HORA ANTES]");
    expect(cuerpoApertura({ ...d, destinoNota: "EL CLIENTE RECOGE EN LA AGENCIA DE ANDAHUAYLAS" })).toContain("   Observaciones:\n   EL CLIENTE RECOGE EN LA AGENCIA DE ANDAHUAYLAS");
    expect(cuerpoApertura({ ...d, destinoNota: "LLAMAR 1 HORA ANTES" })).not.toContain("NOTA: LLAMAR");
    expect(notaDestinoAutomatica(d)).toBe("EQUIPO DEBERÁ LLEGAR A DOMICILIO");
    expect(notaDestinoAutomatica({ ...d, direccionFinal: null })).toBeNull();
  });

  it("recojo en nuestras instalaciones: el cliente lo recoge y la dirección es el destino final (Ariana, 10-10; 0434)", () => {
    const filas = filasApertura({ ...PERU_VACATION, entregaModo: "planta" });
    expect(filas[3].informacion).toBe("RECOJO EN NUESTRAS INSTALACIONES\n(el cliente lo recoge en planta con su transporte)");
    expect(filas[4].informacion).toBe("Calle Bolívar 150 Miraflores");
    expect(faltantesApertura({ ...PERU_VACATION, entregaModo: "planta" })).not.toContain("la dirección de la agencia (primer destino)");
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
    expect(filasApertura(d)[4].informacion).not.toContain("SANTA MARIA DE SARAJA (ESPALDA CHIFA CENTRAL) ICA - ICA - ICA\nNRO.");
    expect(filasApertura({ ...d, direccionFinal: "Calle Otra 123, Pisco" })[4].informacion).toContain("Calle Otra 123, Pisco");
  });

  it("sin dirección final, el primer destino es solo la dirección", () => {
    expect(filasApertura(PERU_VACATION)[3].informacion).toBe("Calle Bolívar 150 Miraflores");
  });

  it("el día va en formato peruano", () => {
    expect(filasApertura(MOTORGAS)[5].informacion).toBe("25/08/2026");
  });

  it("quien recibe va con DNI y celular cuando se tienen", () => {
    expect(filasApertura(MOTORGAS)[6].informacion).toBe("Felix Alejandro Reyes Ortiz\nDNI: 43538088\nCel: 904895898");
    expect(filasApertura(PERU_VACATION)[6].informacion).toBe("ANA CARDENAS\nCel: 996 155 115");
    // Recibe una empresa (Rubí, 15-10): con 11 dígitos va como RUC, no como DNI.
    expect(filasApertura({ ...MOTORGAS, recibeNombre: "CONSORCIO EL PORTAL DEL MARQUÉS SAC", recibeDoc: "20100047218" })[6].informacion).toBe(
      "CONSORCIO EL PORTAL DEL MARQUÉS SAC\nRUC: 20100047218\nCel: 904895898",
    );
  });

  it("lo que falta se marca, no se inventa", () => {
    expect(filasApertura(MOTORGAS)[7].informacion).toBe("—");
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
    expect(faltantesApertura({ ...MOTORGAS, ordenTipo: "sin" })).toEqual([]);
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

  it("hay un formato por cada caso: los tres de Lesly y la puesta en marcha sola de Rubí (05-10)", () => {
    expect(TIPOS_APERTURA.map((t) => t.clave)).toEqual([
      "entrega",
      "entrega_puesta_marcha",
      "puesta_marcha",
      "mantenimiento",
      "entrega_garantia",
      "servicio_tecnico",
      "revision_garantia",
      "capacitacion",
    ]);
  });
});

describe("entrega de repuestos por garantía (buzón Rubí 12-10, 0441)", () => {
  const GARANTIA: DatosApertura = {
    ...MOTORGAS,
    tipo: "entrega_garantia",
    equipo: "CANTIDAD: 2\nEMPAQUETADURA DE PUERTA MOD MDS47123611\n\nCANTIDAD: 1\nVALVULA DE DRENAJE MDB-O-3",
    serie: null,
    tecnico: null,
  };
  it("la fila 1 sale con su encabezado y los repuestos con su cantidad, como un pedido", () => {
    const f1 = filasApertura(GARANTIA)[0];
    expect(f1.informacion.startsWith("ENTREGA DE REPUESTOS POR GARANTÍA:")).toBe(true);
    expect(f1.informacion).toContain("CANTIDAD: 2\nEMPAQUETADURA DE PUERTA");
  });
  it("no exige técnico ni a quién coordinar viáticos", () => {
    const falta = faltantesApertura(GARANTIA);
    expect(falta).not.toContain("el técnico asignado");
    expect(falta).not.toContain("con quién coordina contabilidad (movilidad y viáticos)");
  });
  it("queda como despacho en el correo", () => {
    expect(cuerpoApertura(GARANTIA)).toContain("el siguiente despacho");
  });
});

describe("orden de compra u orden de servicio en la fila 2 (buzón Rubí 16-10)", () => {
  it("va después de «Servicio a realizar» y dice cuál es", () => {
    const oc = filasApertura({ ...PERU_VACATION, ordenTipo: "compra", ordenNumero: " 4500012345 " });
    expect(oc[1]).toMatchObject({ n: 2, descripcion: "ORDEN DE COMPRA", informacion: "N° 4500012345" });
    expect(filasApertura({ ...PERU_VACATION, ordenTipo: "servicio", ordenNumero: "OS-77" })[1].descripcion).toBe("ORDEN DE SERVICIO");
    expect(filasApertura({ ...PERU_VACATION, ordenTipo: "sin" })[1].informacion).toBe("EL CLIENTE NO EMITIÓ ORDEN");
    expect(filasApertura(PERU_VACATION)[1].informacion).toBe("—");
    expect(cuerpoApertura({ ...PERU_VACATION, ordenTipo: "compra", ordenNumero: "4500012345" })).toContain("2. ORDEN DE COMPRA\n   N° 4500012345");
  });
  it("sin elegir se avisa; lo escrito en aperturas anteriores sigue en su fila", () => {
    expect(faltantesApertura(PERU_VACATION)).toContain("si hay orden de compra u orden de servicio");
    const f = filasApertura({ ...PERU_VACATION, obsFilas: { "2": "Facturar a la sede Cusco", oc: "Copia de la OC con la guía" } });
    expect(f[2]).toMatchObject({ n: 3, descripcion: "CLIENTE", observaciones: "Facturar a la sede Cusco" });
    expect(f[1].observaciones).toBe("Copia de la OC con la guía");
  });
});
