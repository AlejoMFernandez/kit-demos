// Eventos editables desde el panel (kit 1.18): catas, pop-ups, shows con fecha, hora y cupo.
// Puro, sin DOM: lo usan el sitio, el panel y las pruebas.
//
// cliente.json → "eventos": [{ "id": "cata-1", "tipo": "cata", "nombre": "Cata de vinos naturales",
//   "fecha": "2026-11-12", "hora": "21:00", "cupo": 20, "precio": 50000,
//   "descripcion": "Cuatro etiquetas con menú de pasillo.", "reserva": true }]
// Son la semilla: lo que el dueño crea, edita o borra en /admin → Eventos pisa esa lista (demo: localStorage,
// producción: negocios.config.eventos). Cada evento con "reserva": true se convierte en un servicio de reservas
// con "fechas" (kit 1.14), así la inscripción, el cupo y el panel de reservas funcionan sin cambios.
import { aMin } from './turnos.js';

export const PREFIJO_SERVICIO = 'ev-';
export const tieneEventos = (config) => Array.isArray(config?.eventos);

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^[0-2]\d:[0-5]\d$/;

export function limpiarEvento(ev = {}) {
  const cupo = Math.max(1, Math.min(999, Math.round(Number(ev.cupo) || 0) || 20));
  const precio = ev.precio === '' || ev.precio == null || isNaN(Number(ev.precio)) ? null : Math.max(0, Number(ev.precio));
  return {
    id: String(ev.id || '').trim(),
    tipo: String(ev.tipo || 'evento').slice(0, 30),
    nombre: String(ev.nombre || '').trim().slice(0, 90),
    fecha: FECHA.test(ev.fecha || '') ? ev.fecha : '',
    hora: HORA.test(ev.hora || '') ? ev.hora : '',
    cupo, precio,
    descripcion: String(ev.descripcion || '').trim().slice(0, 400),
    reserva: ev.reserva !== false,
    ...(ev.foto ? { foto: String(ev.foto) } : {}),
  };
}

export function validarEvento(ev) {
  const faltan = [];
  if (!ev.nombre) faltan.push('nombre');
  if (!ev.fecha) faltan.push('fecha');
  if (!ev.hora) faltan.push('hora');
  return faltan;
}

// Lista ordenada por fecha y hora. "guardados" (array) pisa la semilla de cliente.json.
export function eventosDe(config, guardados = null) {
  const base = Array.isArray(guardados) ? guardados : (config?.eventos || []);
  return base.map(limpiarEvento).filter(e => e.id && e.fecha && e.hora)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || aMin(a.hora) - aMin(b.hora));
}

// Próximos (desde hoy, inclusive).
export const proximos = (eventos, hoy) => eventos.filter(e => e.fecha >= hoy);

export const servicioDeEvento = (ev) => ({
  id: PREFIJO_SERVICIO + ev.id, nombre: ev.nombre, fechas: [ev.fecha], evento: ev.id,
  tandas: [{ nombre: ev.nombre, turnos: [ev.hora], capacidad: ev.cupo }],
});

// Mete los eventos con reserva como servicios de config.reservas (en el lugar: el resto del kit lee esa referencia).
// Los servicios fijos de cliente.json (sin "evento") se respetan.
export function aplicarEventos(config, eventos) {
  config.reservas = config.reservas || {};
  // el array se cambia en el lugar: quien guardó una copia de config.reservas (ej. el panel) sigue viendo lo nuevo
  if (!Array.isArray(config.reservas.servicios)) config.reservas.servicios = [];
  const arr = config.reservas.servicios;
  const fijos = arr.filter(s => !s.evento);
  const nuevos = eventos.filter(e => e.reserva).map(servicioDeEvento);
  arr.splice(0, arr.length, ...fijos, ...nuevos);
  const maxCupo = Math.max(0, ...eventos.map(e => e.cupo));
  if (maxCupo && !(config.reservas.capacidad >= maxCupo)) config.reservas.capacidad = maxCupo;
  return config.reservas.servicios;
}

// id corto y legible a partir del nombre y la fecha
export function idEvento(ev, existentes = []) {
  const base = `${String(ev.nombre || 'evento').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'evento'}-${(ev.fecha || '').slice(5).replace('-', '')}`;
  let id = base, n = 2;
  while (existentes.includes(id)) id = `${base}-${n++}`;
  return id;
}
