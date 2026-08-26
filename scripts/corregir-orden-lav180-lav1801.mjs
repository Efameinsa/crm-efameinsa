// Reportado por Santos 26-08 (segunda vuelta): dos problemas de fidelidad al
// Word en LAV180-V1 y LAV1801.
//
// 1) ORDEN: el Word de ambas trae "DISEÑO DE CONSTRUCCION" ANTES de
//    "AUTOMATIZACIÓN, SEGURIDAD Y CONTROL", pero el PDF (y el buscador del
//    cotizador) imprimían el orden fijo de siempre (caracteristicas primero).
//    Se fija ordenSecciones para que respete el orden real de esta ficha.
//
// 2) "Capacidad: 18-20 kg" apareciendo en ESPECIFICACIONES TÉCNICAS: viene de
//    un mecanismo general (route.tsx `dimensionesConCapacidad`) que antepone
//    la capacidad ahí porque MUCHAS fichas la traen así en el Word real. La
//    de RX180 (LAV180-V1/LAV1801) NO la trae -- la capacidad solo está en la
//    tabla de cabecera. Se agregó `sinCapacidadEnEspecificaciones: true` para
//    que esta ficha puntual no reciba ese agregado.

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const SKUS = ['LAV180-V1', 'LAV1801'];

for (const sku of SKUS) {
  const { data: producto, error: errBuscar } = await supabase
    .from('productos')
    .select('id, ficha')
    .eq('sku', sku)
    .single();
  if (errBuscar) { console.error(sku, 'no encontrado:', errBuscar.message); continue; }

  const ficha = {
    ...producto.ficha,
    ordenSecciones: ['disenoConstruccion', 'caracteristicas', 'dimensiones', 'medidas'],
    sinCapacidadEnEspecificaciones: true,
  };

  const { error: errUpd } = await supabase.from('productos').update({ ficha }).eq('id', producto.id);
  if (errUpd) { console.error(sku, 'error actualizando ficha:', errUpd.message); continue; }
  console.log(sku, '-> orden fijado a disenoConstruccion primero, capacidad sintética desactivada');
}
process.exit(0);
