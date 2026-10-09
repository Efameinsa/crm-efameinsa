/**
 * Formularios de Meta → CRM de Efameinsa (09-10-2026).
 *
 * Meta escribe cada formulario en este Google Sheets. Este script, cada
 * 5 minutos, toma las filas nuevas y las manda al CRM, que las asigna al
 * comercial dueño de la campaña (o a Central si la campaña no tiene dueño).
 *
 * NO toca las pestañas que llena Meta. Lleva su control en la pestaña
 * «CRM_envios» (id del contacto, fecha, resultado). Si una fila falla, se
 * reintenta en la siguiente vuelta y se avisa por correo (máx. 1 por hora).
 *
 * INSTALACIÓN (una sola vez):
 *  1. En el Sheets: Extensiones → Apps Script. Pegar este archivo completo.
 *  2. Configuración del proyecto (engranaje) → Propiedades de la secuencia
 *     de comandos → agregar:
 *       CRM_URL    = https://crm.efameinsa.com/api/webhooks/meta-leads-sheets
 *       CRM_CLAVE  = (la clave que te pasa Claude; no la escribas en el código)
 *       CORREO_ALERTA = gestion1@efameinsa.com
 *  3. Elegir la función «instalar» arriba y darle ▶ Ejecutar. Aceptar los
 *     permisos que pide Google (leer el Sheets, conectarse a internet,
 *     enviar correo como tú).
 *  4. Elegir «enviarAlCrm» y ▶ Ejecutar una vez para probar; ver el
 *     resultado en «Registro de ejecución» y en la pestaña CRM_envios.
 */

var HOJA_CONTROL = 'CRM_envios';
var POR_LOTE = 50;

function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarAlCrm') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarAlCrm').timeBased().everyMinutes(5).create();
  hojaControl_();
  Logger.log('Listo: enviarAlCrm correrá cada 5 minutos.');
}

function enviarAlCrm() {
  var bloqueo = LockService.getScriptLock();
  if (!bloqueo.tryLock(5000)) return; // otra vuelta sigue corriendo
  try {
    var props = PropertiesService.getScriptProperties();
    var url = props.getProperty('CRM_URL');
    var clave = props.getProperty('CRM_CLAVE');
    if (!url || !clave) throw new Error('Faltan CRM_URL o CRM_CLAVE en las propiedades del script');

    var libro = SpreadsheetApp.getActiveSpreadsheet();
    var control = hojaControl_();
    var enviados = idsEnviados_(control);
    var pendientes = [];

    libro.getSheets().forEach(function (hoja) {
      if (hoja.getName() === HOJA_CONTROL || hoja.getLastRow() < 2) return;
      // getDisplayValues: los ID largos de Meta llegan como texto, sin
      // redondeo ni notación científica.
      var datos = hoja.getRange(1, 1, hoja.getLastRow(), hoja.getLastColumn()).getDisplayValues();
      var encabezados = datos[0].map(function (h) { return String(h).trim(); });
      var colId = encabezados.indexOf('id');
      if (colId < 0) return; // no es una pestaña de formularios de Meta
      for (var i = 1; i < datos.length; i++) {
        var id = String(datos[i][colId]).trim();
        if (!id || enviados[id]) continue;
        var fila = {};
        for (var c = 0; c < encabezados.length; c++) {
          if (encabezados[c]) fila[encabezados[c]] = datos[i][c];
        }
        pendientes.push(fila);
      }
    });

    if (!pendientes.length) return;

    var errores = [];
    for (var desde = 0; desde < pendientes.length; desde += POR_LOTE) {
      var lote = pendientes.slice(desde, desde + POR_LOTE);
      var resp = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + clave },
        payload: JSON.stringify({ filas: lote }),
        muteHttpExceptions: true,
      });
      var codigo = resp.getResponseCode();
      if (codigo !== 200) {
        errores.push('El CRM respondió ' + codigo + ': ' + resp.getContentText().slice(0, 300));
        break; // se reintenta todo en la siguiente vuelta
      }
      var resultados = JSON.parse(resp.getContentText()).resultados || [];
      var ahora = new Date();
      resultados.forEach(function (r) {
        var idOriginal = buscarIdOriginal_(lote, r.id);
        if (r.estado === 'creado' || r.estado === 'duplicado' || r.estado === 'vacio' || r.estado === 'sin_id') {
          var detalle = r.estado === 'creado' ? (r.codigo + (r.asignado_a ? ' → ' + r.asignado_a : ' → Central')) : r.estado;
          control.appendRow([idOriginal, ahora, r.estado, detalle]);
        } else {
          errores.push((idOriginal || '(sin id)') + ': ' + (r.detalle || r.estado));
        }
      });
    }

    if (errores.length) avisar_(errores);
  } catch (e) {
    avisar_([String(e && e.message || e)]);
    throw e;
  } finally {
    bloqueo.releaseLock();
  }
}

function hojaControl_() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(HOJA_CONTROL);
  if (!hoja) {
    hoja = libro.insertSheet(HOJA_CONTROL);
    hoja.appendRow(['id', 'enviado', 'estado', 'detalle']);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function idsEnviados_(control) {
  var mapa = {};
  if (control.getLastRow() < 2) return mapa;
  control.getRange(2, 1, control.getLastRow() - 1, 1).getDisplayValues().forEach(function (f) {
    if (f[0]) mapa[String(f[0]).trim()] = true;
  });
  return mapa;
}

// El CRM devuelve el id sin el prefijo «l:»; en el control se guarda tal
// como está en la pestaña de Meta, para reconocerlo en la siguiente vuelta.
function buscarIdOriginal_(lote, idCrm) {
  for (var i = 0; i < lote.length; i++) {
    var id = String(lote[i].id).trim();
    if (id === idCrm || id.replace(/^[a-z]{1,3}:/i, '') === idCrm) return id;
  }
  return idCrm;
}

function avisar_(errores) {
  var props = PropertiesService.getScriptProperties();
  var correo = props.getProperty('CORREO_ALERTA');
  var ultimo = Number(props.getProperty('ULTIMO_AVISO') || 0);
  if (!correo || Date.now() - ultimo < 60 * 60 * 1000) return;
  props.setProperty('ULTIMO_AVISO', String(Date.now()));
  MailApp.sendEmail(
    correo,
    'Formularios de Meta: no se pudieron enviar al CRM',
    'El script del Sheets «' + SpreadsheetApp.getActiveSpreadsheet().getName() + '» no pudo mandar contactos al CRM. ' +
      'Se reintenta solo cada 5 minutos; los contactos siguen guardados en el Sheets.\n\n' + errores.join('\n')
  );
}
