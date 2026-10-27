// Panel → ESTADÍAS (alojamientos): ocupación por habitación, solicitudes, próximas llegadas,
// tarifas por temporada editables, reserva manual y bloqueo de fechas.
import { esc, h, $, $$ } from '../core/util.js';
import { t } from '../core/i18n.js';
import { popup, confirmar, toast } from '../core/ui.js';
import { diaNum, fechaDeNum, diaSemana } from '../core/turnos.js';
import { configEstadias, ACTIVA } from '../core/estadias.js';
import { linkWhatsApp } from '../core/pedidos.js';

export function panelEstadias(ctx, { hoy, render }) {
  const { config, store } = ctx;
  const E = configEstadias(config);
  const st = { desde: null };
  const DIAS = 14;
  const habNombre = (id) => E.habitaciones.find(x => x.id === id)?.nombre || id;
  const fCorta = (f) => { const [, m, d] = f.split('-').map(Number); return `${t('diasCortos')[diaSemana(f)]} ${d} ${t('meses')[m - 1]}`; };
  const fNum = (f) => { const [, m, d] = f.split('-').map(Number); return `${d}/${m}`; };
  const origen = (o) => t(`origen_${o}`);

  function barra(e, ini) {
    const a = Math.max(0, diaNum(e.llegada) - ini), b = Math.min(DIAS, diaNum(e.salida) - ini);
    if (b <= 0 || a >= DIAS) return '';
    const corta = a > 0 ? '' : ' is-cont';
    const cls = `kad-eb kad-eb--${esc(e.origen)}${e.estado === 'pendiente' ? ' is-pend' : ''}${corta}`;
    const txt = e.origen === 'bloqueo' ? t('origen_bloqueo') + (e.comentario ? ` · ${e.comentario}` : '') : `${e.nombre || origen(e.origen)}${e.origen !== 'web' ? '' : ' · web'}${e.pagoEstado === 'aprobado' ? ' · ✓' : ''}`;
    return `<button type="button" class="${cls}" data-e-id="${esc(e.id)}" style="grid-column:${a + 1} / ${b + 1}" title="${esc(`${txt} · ${fNum(e.llegada)} → ${fNum(e.salida)}`)}"><span>${esc(txt)}</span></button>`;
  }

  function tarjeta(e, conAcciones = true) {
    const wa = e.telefono ? linkWhatsApp(e.telefono, t('estWADueno', { negocio: config.nombre, habitacion: habNombre(e.habitacion), llegada: fCorta(e.llegada), salida: fCorta(e.salida), nombre: (e.nombre || '').split(' ')[0] })).url : '';
    return `<article class="kad-ec" data-e-card="${esc(e.id)}">
      <div class="kad-ec__top"><b>${esc(e.nombre || origen(e.origen))}</b><span class="kad-est kad-est--${e.estado === 'pendiente' ? 'pendiente' : 'confirmada'}">${esc(t(e.estado))}</span></div>
      <p>${esc(habNombre(e.habitacion))} · ${esc(fCorta(e.llegada))} → ${esc(fCorta(e.salida))} · ${e.noches} ${esc(t(e.noches === 1 ? 'estNoche' : 'estNoches'))}</p>
      <p class="kad-ec__sub">${e.horaLlegada ? `${esc(t('estHoraLlegada'))}: ${esc(e.horaLlegada)} · ` : ''}${e.huespedes} ${esc(t('estHuespedes').toLowerCase())} · ${esc(origen(e.origen))}${e.total != null ? ` · ${ctx.money(e.total)}` : ''}${e.sena ? ` · ${esc(t(e.pagoEstado === 'aprobado' ? 'estPagada' : 'estPagoPend'))} ${ctx.money(e.sena)}` : ''}</p>
      ${e.comentario ? `<p class="kad-ec__nota">“${esc(e.comentario)}”</p>` : ''}
      ${conAcciones ? `<div class="kad-ec__acc">
        ${e.estado === 'pendiente' ? `<button type="button" class="kit-btn kit-btn--sm" data-e-estado="confirmada">${esc(t('estConfirmar'))}</button>` : ''}
        ${wa ? `<a class="kit-btn kit-btn--sm kit-btn--ghost" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        <button type="button" class="kit-btn kit-btn--sm kit-btn--ghost kit-btn--danger-t" data-e-estado="cancelada">${esc(t('cancelar'))}</button></div>` : ''}
    </article>`;
  }

  function filaTarifa(nombre, id, precios, sub = '') {
    return `<tr><th scope="row">${esc(nombre)}${sub ? `<small>${esc(sub)}</small>` : ''}</th>${E.habitaciones.map(x => `<td><input class="kad-tf" inputmode="numeric" data-tf="${esc(id)}|${esc(x.id)}" value="${precios?.[x.id] ?? ''}" aria-label="${esc(`${nombre} · ${x.nombre}`)}" placeholder="—"></td>`).join('')}</tr>`;
  }

  async function vista(main) {
    const [todas, tf] = await Promise.all([store.getEstadias(), store.getTarifas()]);
    const H = hoy(); st.desde = st.desde || H;
    const ini = diaNum(st.desde);
    const dias = Array.from({ length: DIAS }, (_, i) => fechaDeNum(ini + i));
    const activas = todas.filter(ACTIVA);
    const pend = activas.filter(e => e.estado === 'pendiente' && e.salida >= H && e.origen !== 'bloqueo');
    const prox = activas.filter(e => e.estado === 'confirmada' && e.llegada >= H && e.origen !== 'bloqueo' && !e.demo).slice(0, 6);
    const [, m1, d1] = dias[0].split('-').map(Number); const [, m2, d2] = dias[DIAS - 1].split('-').map(Number);

    main.innerHTML = `
      <div class="kad-head kad-head--row"><h1>${esc(t('estadias'))}</h1>
        <div class="kad-est-acc"><button type="button" class="kit-btn kit-btn--ghost" data-e-nueva="manual">+ ${esc(t('estManual'))}</button><button type="button" class="kit-btn" data-e-nueva="bloqueo">${esc(t('estBloquear'))}</button></div></div>
      <section class="kad-card-box kad-est-ocup">
        <div class="kad-est-ocup__nav"><h2>${esc(t('estOcupacion'))}</h2>
          <div class="kad-est-ocup__mov"><button type="button" class="kit-icon" data-e-mover="-7" aria-label="${esc(t('estSemana'))} −">‹</button>
          <button type="button" class="kit-btn kit-btn--sm kit-btn--ghost" data-e-hoy>${esc(t('hoy'))}</button>
          <span>${d1} ${esc(t('meses')[m1 - 1])} – ${d2} ${esc(t('meses')[m2 - 1])}</span>
          <button type="button" class="kit-icon" data-e-mover="7" aria-label="${esc(t('estSemana'))} +">›</button></div></div>
        <div class="kad-est-scroll"><div class="kad-est-grid" style="--dias:${DIAS}">
          <div class="kad-est-row kad-est-row--head"><span class="kad-est-hab"></span><div class="kad-est-track">${dias.map(f => { const w = diaSemana(f); return `<span class="kad-est-dia${f === H ? ' is-hoy' : ''}${w === 0 || w === 6 ? ' is-finde' : ''}"><small>${esc(t('diasCortos')[w].slice(0, 2))}</small>${Number(f.slice(8))}</span>`; }).join('')}</div></div>
          ${E.habitaciones.map(x => `<div class="kad-est-row"><span class="kad-est-hab">${esc(x.nombre)}</span><div class="kad-est-track">${dias.map(f => `<i class="kad-est-celda${f === H ? ' is-hoy' : ''}" data-e-celda="${x.id}|${f}"></i>`).join('')}${activas.filter(e => e.habitacion === x.id).map(e => barra(e, ini)).join('')}</div></div>`).join('')}
        </div></div>
        <div class="kad-est-ley"><span class="kad-eb kad-eb--web">Web</span><span class="kad-eb kad-eb--web is-pend">${esc(t('pendiente'))}</span><span class="kad-eb kad-eb--whatsapp">WhatsApp</span><span class="kad-eb kad-eb--booking">Booking</span><span class="kad-eb kad-eb--bloqueo">${esc(t('origen_bloqueo'))}</span></div>
      </section>
      <div class="kad-est-cols">
        <section class="kad-card-box"><h2>${esc(t('estSolicitudes'))} ${pend.length ? `<b class="kad-est-n">${pend.length}</b>` : ''}</h2>${pend.length ? pend.map(e => tarjeta(e)).join('') : `<p class="kad-vacio">${esc(t('estSinSolicitudes'))}</p>`}</section>
        <section class="kad-card-box"><h2>${esc(t('estProximas'))}</h2>${prox.length ? prox.map(e => tarjeta(e)).join('') : `<p class="kad-vacio">${esc(t('estSinProximas'))}</p>`}</section>
      </div>
      <section class="kad-card-box kad-est-tf">
        <h2>${esc(t('estTarifas'))}</h2><p class="kad-hint">${esc(t('estTarifaHint'))}</p>
        <div class="kad-est-scroll"><table class="kad-tf-tabla"><thead><tr><th></th>${E.habitaciones.map(x => `<th scope="col">${esc(x.nombre)}</th>`).join('')}</tr></thead><tbody>
          ${(tf.temporadas || []).map(s => filaTarifa(s.nombre, s.id, s.precios, `${fNum(`2000-${s.desde}`)} → ${fNum(`2000-${s.hasta}`)}`)).join('')}
          ${filaTarifa(t('estBase'), 'base', tf.base)}
        </tbody></table></div>
        <div class="kad-est-tf__extra"><label class="kit-field"><span>${esc(t('estSenaPct'))}</span><input class="kad-tf" inputmode="numeric" data-tf-sena value="${tf.sena ?? E.sena}"></label>
          <label class="kit-field"><span>${esc(t('estMinNochesLbl'))}</span><input class="kad-tf" inputmode="numeric" data-tf-min value="${tf.minNoches ?? E.minNoches}"></label></div>
      </section>`;

    main.onclick = async (e) => {
      const mv = e.target.closest('[data-e-mover]'); if (mv) { st.desde = fechaDeNum(diaNum(st.desde) + Number(mv.dataset.eMover)); render(); return; }
      if (e.target.closest('[data-e-hoy]')) { st.desde = hoy(); render(); return; }
      const nv = e.target.closest('[data-e-nueva]'); if (nv) { formNueva(nv.dataset.eNueva); return; }
      const cel = e.target.closest('[data-e-celda]'); if (cel) { const [hab, f] = cel.dataset.eCelda.split('|'); formNueva('manual', { habitacion: hab, llegada: f, salida: fechaDeNum(diaNum(f) + 2) }); return; }
      const bar = e.target.closest('[data-e-id]'); if (bar) { detalle(todas.find(x => x.id === bar.dataset.eId)); return; }
      const es = e.target.closest('[data-e-estado]');
      if (es) {
        const id = es.closest('[data-e-card]').dataset.eCard; const nuevo = es.dataset.eEstado;
        if (nuevo === 'cancelada' && !(await confirmar(`${t('cancelar')}?`, { ok: t('cancelar'), peligro: true }))) return;
        try { await store.updateEstadia(id, { estado: nuevo }); toast(t(nuevo)); render(); } catch (err) { toast(t(err.code === 'sin_lugar' ? 'estRangoOcupado' : 'error'), 'warn'); }
      }
    };
    main.onchange = async (e) => {
      if (!e.target.matches('.kad-tf')) return;
      const nuevo = { ...tf, base: { ...(tf.base || {}) }, temporadas: (tf.temporadas || []).map(s => ({ ...s, precios: { ...(s.precios || {}) } })) };
      $$('[data-tf]', main).forEach(inp => {
        const [sid, hid] = inp.dataset.tf.split('|'); const v = inp.value.replace(/[^\d]/g, ''); const n = v === '' ? null : Number(v);
        if (sid === 'base') nuevo.base[hid] = n; else { const s = nuevo.temporadas.find(x => x.id === sid); if (s) s.precios[hid] = n; }
        inp.value = n == null ? '' : n;
      });
      nuevo.sena = Math.max(0, Math.min(100, Number($('[data-tf-sena]', main).value) || 0));
      nuevo.minNoches = Math.max(1, Math.min(30, Number($('[data-tf-min]', main).value) || 1));
      await store.saveTarifas(nuevo); Object.assign(tf, nuevo); toast(t('guardado'));
    };
  }

  function detalle(e) {
    if (!e) return;
    const box = h(`<div class="kad-est-det">${tarjeta(e, e.origen !== 'bloqueo')}${e.origen === 'bloqueo' || e.demo ? `<div class="kit-row"><button type="button" class="kit-btn kit-btn--ghost kit-btn--danger-t" data-borrar>${esc(t('estEliminar'))}</button></div>` : ''}</div>`);
    const p = popup({ titulo: t('estDetalle'), contenido: box, clase: 'kit-pop--sm' });
    box.addEventListener('click', async (ev) => {
      const es = ev.target.closest('[data-e-estado]');
      if (es) { try { await store.updateEstadia(e.id, { estado: es.dataset.eEstado }); toast(t(es.dataset.eEstado)); p.close(); render(); } catch (err) { toast(t(err.code === 'sin_lugar' ? 'estRangoOcupado' : 'error'), 'warn'); } return; }
      if (ev.target.closest('[data-borrar]')) { await store.deleteEstadia(e.id); p.close(); render(); }
    });
  }

  function formNueva(tipo, ini = {}) {
    const H = hoy(); const bloqueo = tipo === 'bloqueo';
    const f = h(`<form class="kit-form kad-est-form">
      <label class="kit-field"><span>${esc(t('estHabitacion'))}</span><select name="habitacion">${E.habitaciones.map(x => `<option value="${esc(x.id)}" ${x.id === ini.habitacion ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></label>
      <div class="kad-est-form__2"><label class="kit-field"><span>${esc(t('estLlegada'))}</span><input type="date" name="llegada" min="${H}" value="${ini.llegada || H}" required></label>
      <label class="kit-field"><span>${esc(t('estSalida'))}</span><input type="date" name="salida" min="${H}" value="${ini.salida || fechaDeNum(diaNum(H) + 2)}" required></label></div>
      ${bloqueo ? `<label class="kit-field"><span>${esc(t('estMotivo'))}</span><input name="comentario" maxlength="60"></label>` : `
      <label class="kit-field"><span>${esc(t('nombre'))}</span><input name="nombre" autocomplete="off" required></label>
      <div class="kad-est-form__2"><label class="kit-field"><span>${esc(t('telefono'))}</span><input name="telefono" type="tel" inputmode="tel"></label>
      <label class="kit-field"><span>${esc(t('estOrigen'))}</span><select name="origen">${['whatsapp', 'telefono', 'booking', 'manual'].map(o => `<option value="${o}">${esc(origen(o))}</option>`).join('')}</select></label></div>`}
      <p class="kit-msg" role="alert" hidden></p>
      <button class="kit-btn kit-btn--block kit-btn--big">${esc(bloqueo ? t('estBloquear') : t('guardar'))}</button></form>`);
    const p = popup({ titulo: bloqueo ? t('estBloquear') : t('estManual'), contenido: f, clase: 'kit-pop--sm' });
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); const d = Object.fromEntries(new FormData(f)); const msg = $('.kit-msg', f);
      if (!(d.salida > d.llegada)) { msg.textContent = t('estFechas'); msg.hidden = false; return; }
      try { await store.createEstadia({ ...d, origen: bloqueo ? 'bloqueo' : d.origen }); p.close(); toast(t('guardado')); st.desde = st.desde && d.llegada < st.desde ? d.llegada : st.desde; render(); }
      catch (err) { msg.textContent = t(err.code === 'sin_lugar' ? 'estRangoOcupado' : 'error'); msg.hidden = false; }
    });
  }

  return { vista };
}
