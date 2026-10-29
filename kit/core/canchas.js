// CANCHAS (kit 1.12, complejos de fútbol, pádel, tenis…). Puro, sin DOM: lo usan el sitio, el panel y las pruebas.
//
// cliente.json → "canchas": {
//   "canchas":  [{ "id": "p1", "nombre": "Pádel 1", "deporte": "padel" }, { "id": "f1", "nombre": "Fútbol 5 · 1", "deporte": "f5" }],
//   "deportes": [{ "id": "padel", "nombre": "Pádel", "duracion": 90 },
//                { "id": "f5", "nombre": "Fútbol 5", "duracion": 60 },
//                { "id": "f8", "nombre": "Fútbol 8", "duracion": 60, "usa": ["f1", "f2", "f3"] }],   // combinada: ocupa esas canchas juntas
//   "tarifas":  { "padel": { "noPico": 45000, "pico": 70000 }, "f8": { "noPico": 120000, "pico": 190000 } },
//   "pico":     { "desde": "18:00", "findes": true, "feriados": true },    // findes/feriados: todo el día es pico
//   "feriados": ["2026-11-23"],
//   "sena": 30,                                                            // % del turno para confirmar con Mercado Pago (0 = sin seña)
//   "extras":   [{ "id": "paleta", "nombre": "Paleta de pádel", "precio": 5000, "deportes": ["padel"], "max": 4 }],
//   "diasAdelante": 14, "anticipacionMin": 30, "cancelacionHoras": 48
// }
// Los turnos arrancan alineados a la apertura del día (horarios) cada `duracion` minutos.
// Horas en MINUTOS del día de servicio (1440 = 24:00). Un turno ocupa [desde, hasta).
import { aMin, aHora, diaSemana, franjas, diaNum, fechaDeNum } from './turnos.js';

export const ACTIVO = (x) => !!x && x.estado !== 'cancelada';

export function configCanchas(config = {}) {
  const C = config.canchas || {};
  const canchas = (C.canchas || []).map((c, i) => ({ orden: i, ...c }));
  const deportes = (C.deportes || []).map(d => ({
    duracion: 60, ...d,
    canchas: d.usa ? d.usa.slice() : (d.canchas || canchas.filter(c => c.deporte === d.id).map(c => c.id)),
    combinada: !!d.usa,
  }));
  return {
    canchas, deportes,
    tarifas: C.tarifas || {},
    pico: { desde: '18:00', findes: true, feriados: true, ...(C.pico || {}) },
    feriados: C.feriados || config.feriados || [],
    sena: C.sena ?? 30,
    extras: C.extras || [],
    diasAdelante: C.diasAdelante || 14,
    anticipacionMin: C.anticipacionMin ?? 30,
    cancelacionHoras: C.cancelacionHoras ?? 48,
  };
}

export const deporteDe = (cfg, id) => cfg.deportes.find(d => d.id === id) || null;
export const canchaDe = (cfg, id) => cfg.canchas.find(c => c.id === id) || null;
export const nombreCancha = (cfg, id) => canchaDe(cfg, id)?.nombre || id;

// Lo que se reserva de un deporte: cada cancha, o una sola unidad que ocupa varias (fútbol 8 = las 3 de fútbol 5)
export function unidades(cfg, depId) {
  const d = deporteDe(cfg, depId); if (!d) return [];
  if (d.combinada) return [{ id: d.id, nombre: d.nombre, ocupa: d.canchas.slice(), combinada: true }];
  return d.canchas.map(id => ({ id, nombre: nombreCancha(cfg, id), ocupa: [id] }));
}
export const ocupaDe = (cfg, depId, unidadId) => unidades(cfg, depId).find(u => u.id === unidadId)?.ocupa || [];
// Deportes que se juegan en una cancha (pádel 1 → pádel; f5·1 → fútbol 5 y fútbol 8)
export const deportesDeCancha = (cfg, canchaId) => cfg.deportes.filter(d => d.canchas.includes(canchaId)).map(d => d.id);

// Inicios de turno del día para un deporte (alineados a la apertura de cada franja)
export function inicios(cfg, horarios, fecha, depId) {
  const d = deporteDe(cfg, depId); if (!d) return [];
  const out = [];
  franjas(horarios, fecha).forEach(([a, b]) => { for (let m = a; m + d.duracion <= b; m += d.duracion) out.push(m); });
  return out;
}

// Ventana del día [apertura, cierre] en minutos (para dibujar la grilla del panel)
export function ventanaDia(horarios, fecha) {
  const f = franjas(horarios, fecha); if (!f.length) return null;
  return [Math.min(...f.map(x => x[0])), Math.max(...f.map(x => x[1]))];
}

// ---------- precios
export function esPico(cfg, fecha, desde, picoDesde) {
  const w = diaSemana(fecha);
  if (cfg.pico.findes && (w === 0 || w === 6)) return true;
  if (cfg.pico.feriados && cfg.feriados.includes(fecha)) return true;
  return desde >= aMin(picoDesde || cfg.pico.desde);
}
// tarifas efectivas: las de cliente.json pisadas por las que guardó el dueño en el panel
export function tarifasDe(cfg, guardadas = {}) {
  const base = {};
  cfg.deportes.forEach(d => { base[d.id] = { noPico: cfg.tarifas[d.id]?.noPico ?? null, pico: cfg.tarifas[d.id]?.pico ?? null, ...(guardadas?.[d.id] || {}) }; });
  const extras = {}; cfg.extras.forEach(x => { extras[x.id] = guardadas?.extras?.[x.id] ?? x.precio ?? null; });
  return { ...base, extras, picoDesde: guardadas?.picoDesde || cfg.pico.desde, sena: guardadas?.sena ?? cfg.sena };
}
const num = (v) => (v == null || v === '' ? null : Number(v));
export function precioTurno(tf, depId, pico) { const t = tf?.[depId]; return t ? num(pico ? t.pico : t.noPico) : null; }
export const extrasDe = (cfg, depId) => cfg.extras.filter(x => !x.deportes || x.deportes.includes(depId));

// { pico, franja, precio, extras: [{ id, nombre, precio, cant }], total, sena, pct, resto }
export function cotizar(cfg, tf, depId, fecha, desde, cants = {}) {
  const pico = esPico(cfg, fecha, desde, tf?.picoDesde);
  const precio = precioTurno(tf, depId, pico);
  const extras = extrasDe(cfg, depId).map(x => ({ id: x.id, nombre: x.nombre, precio: num(tf?.extras?.[x.id] ?? x.precio) || 0, cant: Math.max(0, Math.min(x.max ?? 10, Math.round(Number(cants?.[x.id]) || 0))) })).filter(l => l.cant > 0);
  const total = precio == null ? null : precio + extras.reduce((s, l) => s + l.precio * l.cant, 0);
  const pct = Math.max(0, Math.min(100, Number(tf?.sena ?? cfg.sena) || 0));
  // la seña es sobre el turno (los extras se pagan en el complejo); redondeo a $100
  const sena = precio != null && pct > 0 ? Math.round(precio * pct / 100 / 100) * 100 : null;
  return { pico, franja: pico ? 'pico' : 'noPico', precio, extras, total, sena, pct, resto: total != null ? total - (sena || 0) : null };
}

// ---------- ocupación
export const solapa = (a, b) => a.desde < b.hasta && b.desde < a.hasta;

// Abonos fijos (mismo día y hora todas las semanas) → ocupación de una fecha
export function ocupacionAbonos(abonos = [], fecha) {
  const w = diaSemana(fecha);
  return abonos.filter(a => a.estado !== 'baja' && Number(a.dow) === w && (!a.desde || fecha >= a.desde) && !(a.liberadas || []).includes(fecha))
    .map(a => ({ id: `ab:${a.id}:${fecha}`, abono: a.id, deporte: a.deporte, unidad: a.unidad, canchas: a.canchas, fecha, desde: a.hora, hasta: a.hora + a.duracion,
      nombre: a.nombre, telefono: a.telefono || '', origen: 'abono', estado: 'confirmada' }));
}

// Todo lo que ocupa canchas en una fecha: turnos activos + abonos
export function ocupacionDia(turnos = [], abonos = [], fecha) {
  return [...turnos.filter(x => ACTIVO(x) && x.fecha === fecha), ...ocupacionAbonos(abonos, fecha)];
}

export function libre(ocup, canchas, fecha, desde, hasta, excepto = null) {
  return !ocup.some(o => o.id !== excepto && o.fecha === fecha && o.canchas.some(c => canchas.includes(c)) && solapa(o, { desde, hasta }));
}
// Qué ocupa una cancha en un horario (o null)
export function quienOcupa(ocup, canchaId, fecha, desde, hasta) {
  return ocup.find(o => o.fecha === fecha && o.canchas.includes(canchaId) && solapa(o, { desde, hasta })) || null;
}

// Disponibilidad de un deporte en un día:
// [{ desde, hasta, label, pico, pasado, libres, unidades: [{ id, nombre, libre }] }]
export function disponibilidad(cfg, horarios, ocup, depId, fecha, ahora = null) {
  const d = deporteDe(cfg, depId); if (!d) return [];
  const U = unidades(cfg, depId);
  return inicios(cfg, horarios, fecha, depId).map(m => {
    const hasta = m + d.duracion;
    const pasado = !!ahora && (fecha < ahora.fecha || (fecha === ahora.fecha && m < ahora.min + cfg.anticipacionMin));
    const us = U.map(u => ({ id: u.id, nombre: u.nombre, libre: !pasado && libre(ocup, u.ocupa, fecha, m, hasta) }));
    return { desde: m, hasta, label: aHora(m), labelHasta: aHora(hasta >= 1440 ? hasta - 1440 : hasta), pico: esPico(cfg, fecha, m), pasado, libres: us.filter(u => u.libre).length, unidades: us };
  });
}

export function diasReservables(cfg, horarios, hoy) {
  const out = []; const d0 = diaNum(hoy);
  for (let i = 0; i < cfg.diasAdelante; i++) { const f = fechaDeNum(d0 + i); out.push({ fecha: f, dow: diaSemana(f), abierto: franjas(horarios, f).length > 0, offset: i }); }
  return out;
}

// ---------- demo: ocupación de ejemplo relativa a hoy (la grilla nunca arranca vacía)
function hash(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0) % 1000; }
const NOMBRES = ['Martín R.', 'Lucía G.', 'Facu P.', 'Sofi M.', 'Nico B.', 'Agus T.', 'Juli D.', 'Pato S.', 'Cami L.', 'Leo F.', 'Male V.', 'Santi C.'];

export function ocupacionDemo(cfg, horarios, hoy, ahoraMin = 0, abonos = []) {
  const turnos = []; const d0 = diaNum(hoy);
  const comb = cfg.deportes.filter(d => d.combinada);
  for (let i = -1; i < 10; i++) {
    const f = fechaDeNum(d0 + i);
    const ab = ocupacionAbonos(abonos, f);
    const ok = (cs, m, dur) => libre(turnos, cs, f, m, m + dur) && libre(ab, cs, f, m, m + dur);
    // primero alguna combinada (fútbol 8) a la noche
    comb.forEach(d => inicios(cfg, horarios, f, d.id).forEach(m => {
      if (m < 19 * 60 || hash(`${d.id}|${f}|${m}`) > 140) return;
      if (!ok(d.canchas, m, d.duracion)) return;
      turnos.push(demoTurno(d, d.id, d.canchas, f, m, i, turnos.length));
    }));
    cfg.deportes.filter(d => !d.combinada).forEach(d => d.canchas.forEach(c => inicios(cfg, horarios, f, d.id).forEach(m => {
      const w = diaSemana(f); const finde = w === 0 || w === 6;
      const prob = m >= 18 * 60 ? 560 : m >= 12 * 60 ? 260 : 170;
      if (hash(`${c}|${f}|${m}`) > prob + (finde ? 180 : 0)) return;
      if (!ok([c], m, d.duracion)) return;
      turnos.push(demoTurno(d, c, [c], f, m, i, turnos.length));
    })));
  }
  return turnos.map(t => (t.fecha < hoy || (t.fecha === hoy && t.hasta <= ahoraMin) ? { ...t, estado: 'jugado' } : t));
}
function demoTurno(d, unidad, canchas, fecha, m, i, n) {
  const k = hash(`${unidad}${fecha}${m}o`);
  const origen = k < 420 ? 'web' : k < 760 ? 'whatsapp' : 'mostrador';
  return { id: `demo-${unidad}-${fecha}-${m}`, codigo: '', deporte: d.id, unidad, canchas, fecha, desde: m, hasta: m + d.duracion, nombre: NOMBRES[(n + k) % NOMBRES.length],
    telefono: '', extras: [], origen, pago: origen === 'web' ? 'mercadopago' : 'complejo', pagoEstado: origen === 'web' ? 'aprobado' : 'a_coordinar', estado: 'confirmada', demo: true, creado: new Date().toISOString() };
}
export function abonosDemo(cfg) {
  const out = [];
  const pad = cfg.deportes.find(d => !d.combinada && d.duracion >= 80); const fut = cfg.deportes.find(d => !d.combinada && d.duracion < 80);
  if (pad?.canchas[0]) out.push({ id: 'demo-ab1', deporte: pad.id, unidad: pad.canchas[0], canchas: [pad.canchas[0]], dow: 2, hora: 20 * 60, duracion: pad.duracion, nombre: 'Los del martes', telefono: '', estado: 'activo', liberadas: [], demo: true });
  if (pad?.canchas[1]) out.push({ id: 'demo-ab2', deporte: pad.id, unidad: pad.canchas[1], canchas: [pad.canchas[1]], dow: 4, hora: 18 * 60 + 30, duracion: pad.duracion, nombre: 'Fernández', telefono: '', estado: 'activo', liberadas: [], demo: true });
  if (fut?.canchas[0]) out.push({ id: 'demo-ab3', deporte: fut.id, unidad: fut.canchas[0], canchas: [fut.canchas[0]], dow: 3, hora: 21 * 60, duracion: fut.duracion, nombre: 'Fútbol de la oficina', telefono: '', estado: 'activo', liberadas: [], demo: true });
  return out;
}
