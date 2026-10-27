// ESTADÍAS (alojamientos: B&B, cabañas, posadas). Puro, sin DOM: lo usan el sitio, el panel y las pruebas.
//
// cliente.json → "estadias": {
//   "habitaciones": [{ "id": "deluxe", "nombre": "Doble Deluxe", "descripcion": "Cama queen", "capacidad": 2, "foto": "img/hab-deluxe.webp" }],
//   "tarifas": {                                   // precio por noche por habitación (null = "a consultar")
//     "base": { "deluxe": 60000 },
//     "temporadas": [{ "id": "invierno", "nombre": "Invierno", "desde": "07-01", "hasta": "09-30", "precios": { "deluxe": 80000 }, "minNoches": 2 }]
//   },
//   "sena": 30,                                   // % para confirmar con Mercado Pago (0 = sin seña)
//   "minNoches": 1, "maxNoches": 30, "diasAdelante": 365,
//   "checkin": ["14:30", "20:00"], "checkout": "10:30"
// }
// Una estadía ocupa las NOCHES [llegada, salida): el día de salida queda libre para otra llegada.
import { diaNum, fechaDeNum, diaSemana, aMin, aHora } from './turnos.js';

export const ACTIVA = (e) => e && e.estado !== 'cancelada';

export function configEstadias(config = {}) {
  const E = config.estadias || {};
  const ci = Array.isArray(E.checkin) ? E.checkin : [E.checkin || '14:00', E.checkinHasta || '20:00'];
  return {
    habitaciones: (E.habitaciones || []).map((h, i) => ({ capacidad: 2, orden: i, ...h })),
    tarifas: { base: {}, temporadas: [], ...(E.tarifas || {}) },
    sena: E.sena ?? 30,
    minNoches: E.minNoches || 1,
    maxNoches: E.maxNoches || 30,
    diasAdelante: E.diasAdelante || 365,
    checkin: ci, checkout: E.checkout || '10:00',
  };
}

// "MM-DD" dentro de un rango que puede cruzar el año (12-15 → 03-15)
function enRango(mmdd, desde, hasta) { return desde <= hasta ? (mmdd >= desde && mmdd <= hasta) : (mmdd >= desde || mmdd <= hasta); }
export function temporadaDe(tarifas, fecha) { const md = fecha.slice(5); return (tarifas?.temporadas || []).find(t => t.desde && t.hasta && enRango(md, t.desde, t.hasta)) || null; }

export function precioNoche(tarifas, habId, fecha) {
  const t = temporadaDe(tarifas, fecha);
  const v = t?.precios?.[habId] ?? tarifas?.base?.[habId];
  return v == null || v === '' ? null : Number(v);
}

export function nochesEntre(llegada, salida) {
  const a = diaNum(llegada), b = diaNum(salida); const out = [];
  for (let n = a; n < b; n++) out.push(fechaDeNum(n));
  return out;
}

// { noches, detalle: [{ fecha, precio }], total, sena, minNoches, temporada }
export function cotizar(cfg, tarifas, habId, llegada, salida) {
  const fechas = llegada && salida ? nochesEntre(llegada, salida) : [];
  const detalle = fechas.map(f => ({ fecha: f, precio: precioNoche(tarifas, habId, f) }));
  const total = detalle.length && detalle.every(d => d.precio != null) ? detalle.reduce((s, d) => s + d.precio, 0) : null;
  const pct = Number(tarifas?.sena ?? cfg.sena) || 0;
  const minNoches = Math.max(cfg.minNoches, ...fechas.map(f => temporadaDe(tarifas, f)?.minNoches || 0));
  return { noches: fechas.length, detalle, total, sena: total != null && pct > 0 ? Math.round(total * pct / 100) : null, pct, minNoches, temporada: llegada ? temporadaDe(tarifas, llegada) : null };
}

// Noches ocupadas de una habitación (Set de fechas)
export function nochesOcupadas(estadias, habId, excepto = null) {
  const s = new Set();
  estadias.filter(e => ACTIVA(e) && e.habitacion === habId && e.id !== excepto).forEach(e => nochesEntre(e.llegada, e.salida).forEach(f => s.add(f)));
  return s;
}

export function libre(estadias, habId, llegada, salida, excepto = null) {
  const occ = nochesOcupadas(estadias, habId, excepto);
  return nochesEntre(llegada, salida).every(f => !occ.has(f));
}

// Horarios de llegada posibles ("14:30", "15:00"… hasta el cierre del check-in)
export function horasLlegada(cfg, paso = 30) {
  const [a, b] = cfg.checkin; const out = [];
  for (let m = aMin(a); m <= aMin(b); m += paso) out.push(aHora(m));
  return out;
}

// Ocupación de ejemplo para la demo (relativa a hoy): el calendario y el panel nunca arrancan vacíos.
export function ocupacionDemo(cfg, hoy) {
  const h = cfg.habitaciones; if (!h.length) return [];
  const d = diaNum(hoy); const f = (n) => fechaDeNum(d + n);
  const plan = [[3, 3, 'booking'], [9, 2, 'whatsapp'], [17, 4, 'booking'], [26, 2, 'booking'], [38, 5, 'booking'], [52, 3, 'whatsapp']];
  const out = [];
  h.forEach((hab, i) => plan.forEach(([ini, n, origen], k) => {
    if ((k + i) % 2 && k > 1) return;
    const a = ini + i * 2 + (k % 2);
    out.push({ id: `demo-${hab.id}-${k}`, codigo: '', habitacion: hab.id, llegada: f(a), salida: f(a + n), noches: n, huespedes: 2, nombre: origen === 'booking' ? 'Reserva Booking' : 'Consulta por WhatsApp',
      telefono: '', email: '', origen, pago: 'externo', pagoEstado: 'a_coordinar', estado: 'confirmada', creado: new Date().toISOString(), demo: true });
  }));
  return out;
}

export const diaDeSemana = (fecha) => diaSemana(fecha);
