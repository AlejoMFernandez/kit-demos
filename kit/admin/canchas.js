// Panel → CANCHAS (complejos): grilla del día por cancha, turnos para confirmar, próximos turnos,
// abonos fijos (mismo día y hora todas las semanas), precios pico / no pico y bloqueo por lluvia.
import { esc, h, $, $$ } from '../core/util.js';
import { t } from '../core/i18n.js';
import { popup, confirmar, toast } from '../core/ui.js';
import { diaNum, fechaDeNum, diaSemana, aHora, aMin, ahoraEn } from '../core/turnos.js';
import { configCanchas, deporteDe, unidades, ocupaDe, inicios, ventanaDia, ocupacionDia, libre, esPico, nombreCancha, deportesDeCancha, ACTIVO } from '../core/canchas.js';
import { linkWhatsApp } from '../core/pedidos.js';

export function panelCanchas(ctx, { hoy, render }) {
  const { config, store } = ctx;
  const C = configCanchas(config);
  const st = { fecha: null };
  const hhmm = (m) => aHora(m >= 1440 ? m - 1440 : m);
  const fCorta = (f) => { const [, m, d] = f.split('-').map(Number); return `${t('diasCortos')[diaSemana(f)]} ${d}/${m}`; };
  const fLarga = (f) => { const [, m, d] = f.split('-').map(Number); return `${t('diasLargos')[diaSemana(f)]} ${d} de ${t('mesesLargos')?.[m - 1] || m}`; };
  const dep = (id) => deporteDe(C, id);
  const titulo = (x) => {
    if (x.origen === 'bloqueo') return `${t('canBloqueado')}${x.motivo ? ` · ${x.motivo}` : ''}`;
    const d = dep(x.deporte); if (!d) return x.canchas.map(c => nombreCancha(C, c)).join(' + ');
    return d.combinada ? d.nombre : nombreCancha(C, x.unidad || x.canchas[0]);
  };
  const tipo = (x) => x.origen === 'bloqueo' ? 'bloqueo' : x.origen === 'abono' ? 'abono' : x.origen === 'web' ? (x.pagoEstado === 'aprobado' ? 'web' : 'webpend') : 'wa';
  const wa = (x, clave = 'canWADueno', extra = {}) => x.telefono ? linkWhatsApp(x.telefono, t(clave, { negocio: config.nombre, cancha: titulo(x), fecha: fCorta(x.fecha), desde: hhmm(x.desde), nombre: (x.nombre || '').split(' ')[0], ...extra })).url : '';

  // ---------- grilla
  function grilla(ocup, F, ini, fin) {
    const span = fin - ini; const pct = (m) => ((m - ini) / span) * 100;
    const filas = C.canchas; const H = 52;
    const ahora = ahoraEn(ctx.tz);
    const picoIni = esPico(C, F, ini) ? ini : Math.max(ini, aMin(st.tf?.picoDesde || C.pico.desde));
    const horas = []; for (let m = Math.ceil(ini / 60) * 60; m <= fin; m += 60) horas.push(m);
    const bloques = [];
    ocup.forEach(o => {
      const idx = o.canchas.map(c => filas.findIndex(f => f.id === c)).filter(i => i >= 0).sort((a, b) => a - b);
      if (!idx.length) return;
      // filas contiguas → un solo bloque alto (fútbol 8 sobre las 3 de fútbol 5)
      const grupos = []; idx.forEach(i => { const g = grupos[grupos.length - 1]; if (g && i === g[g.length - 1] + 1) g.push(i); else grupos.push([i]); });
      grupos.forEach(g => bloques.push(`<button type="button" class="kad-cb kad-cb--${tipo(o)}${o.estado === 'pendiente' ? ' is-pend' : ''}${o.estado === 'jugado' ? ' is-jugado' : ''}${g.length > 1 ? ' is-comb' : ''}" data-c-id="${esc(o.id)}"
        style="left:${pct(o.desde).toFixed(3)}%;width:${(pct(o.hasta) - pct(o.desde)).toFixed(3)}%;top:${g[0] * H + 4}px;height:${g.length * H - 8}px"
        title="${esc(`${titulo(o)} · ${hhmm(o.desde)}–${hhmm(o.hasta)} · ${o.nombre || ''}`)}"><b>${esc(o.origen === 'abono' ? `★ ${o.nombre}` : o.origen === 'bloqueo' ? t('canBloqueado') : (o.nombre || t(`origen_${o.origen}`)))}</b><span>${esc(o.origen === 'bloqueo' ? (o.motivo || '') : dep(o.deporte)?.combinada ? dep(o.deporte).nombre : `${hhmm(o.desde)} · ${t(`origen_${o.origen}`) || ''}`)}</span></button>`));
    });
    return `<div class="kad-cg-scroll"><div class="kad-cg">
      <div class="kad-cg__horas"><span></span><div class="kad-cg__track">${horas.map(m => `<i style="left:${pct(m)}%">${m >= 1440 ? '24' : hhmm(m).slice(0, 2)}</i>`).join('')}</div></div>
      <div class="kad-cg__cuerpo">
        <div class="kad-cg__nombres">${filas.map(f => `<span style="height:${H}px">${esc(f.nombre)}</span>`).join('')}</div>
        <div class="kad-cg__track kad-cg__area" style="height:${filas.length * H}px" data-c-area>
          ${picoIni < fin ? `<div class="kad-cg__pico" style="left:${pct(picoIni)}%;right:0"></div>` : ''}
          ${horas.map(m => `<i class="kad-cg__l" style="left:${pct(m)}%"></i>`).join('')}
          ${filas.map((f, i) => `<div class="kad-cg__fila" style="top:${i * H}px;height:${H}px" data-c-fila="${esc(f.id)}"></div>`).join('')}
          ${bloques.join('')}
          ${F === ahora.fecha && ahora.min > ini && ahora.min < fin ? `<div class="kad-cg__ahora" style="left:${pct(ahora.min)}%"><span>${hhmm(ahora.min)}</span></div>` : ''}
        </div>
      </div></div></div>`;
  }

  function tarjeta(x, acciones = true) {
    const link = wa(x);
    const pago = x.origen === 'web' ? (x.pagoEstado === 'aprobado' ? `${t('canPagado')} ${x.sena ? ctx.money(x.sena) : ''}` : x.pagoEstado === 'cobrado' ? t('cobrado') : x.pago === 'mercadopago' ? t('canPagoPend') : t('canEnComplejo')) : '';
    return `<article class="kad-cc" data-c-card="${esc(x.id)}">
      <div class="kad-cc__h"><b class="kad-cc__hora">${hhmm(x.desde)}</b><div class="kad-cc__tx"><b>${esc(titulo(x))}</b><span>${esc(fCorta(x.fecha))} · ${esc(x.nombre || '')}${x.origen !== 'bloqueo' ? ` · ${esc(t(`origen_${x.origen}`))}` : ''}</span></div>
        <span class="kad-cc__tag kad-cc__tag--${tipo(x)}">${esc(x.estado === 'pendiente' ? t('pendiente') : x.origen === 'abono' ? t('canAbonoLbl') : t(`origen_${x.origen}`))}</span></div>
      ${(() => { const ps = [x.total != null ? ctx.money(x.total) : '', (x.extras || []).length ? esc(x.extras.map(l => `${l.cant} × ${l.nombre}`).join(', ')) : '', pago ? esc(pago) : '', x.sena && x.pagoEstado === 'aprobado' && x.total != null ? `${esc(t('canResto'))} ${ctx.money(x.total - x.sena)}` : ''].filter(Boolean); return ps.length ? `<p class="kad-cc__sub">${ps.join(' · ')}</p>` : ''; })()}
      ${acciones ? `<div class="kad-cc__acc">
        ${x.estado === 'pendiente' ? `<button type="button" class="kit-btn kit-btn--sm" data-c-estado="confirmada">${esc(t('canConfirmar'))}</button>` : ''}
        ${x.origen !== 'abono' && x.origen !== 'bloqueo' && x.estado !== 'pendiente' && x.pagoEstado !== 'cobrado' ? `<button type="button" class="kit-btn kit-btn--sm kit-btn--ghost" data-c-cobre>${esc(t('canCobreResto'))}</button>` : ''}
        ${link ? `<a class="kit-btn kit-btn--sm kit-btn--ghost" href="${esc(link)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${x.origen === 'abono' ? `<button type="button" class="kit-btn kit-btn--sm kit-btn--ghost" data-c-liberar>${esc(t('canLiberar'))}</button>` : x.origen === 'bloqueo' ? `<button type="button" class="kit-btn kit-btn--sm kit-btn--ghost kit-btn--danger-t" data-c-borrar>${esc(t('canEliminar'))}</button>`
          : `<button type="button" class="kit-btn kit-btn--sm kit-btn--ghost kit-btn--danger-t" data-c-estado="cancelada">${esc(t('cancelar'))}</button>`}
      </div>` : ''}</article>`;
  }

  async function vista(main) {
    const [turnos, abonos, tf] = await Promise.all([store.getTurnosCancha(), store.getAbonosCancha(), store.getTarifasCancha()]);
    st.tf = tf;
    const H = hoy(); st.fecha = st.fecha || H; const F = st.fecha;
    const ahora = ahoraEn(ctx.tz);
    const ocup = ocupacionDia(turnos, abonos, F).sort((a, b) => a.desde - b.desde);
    const ven = ventanaDia(config.horarios, F) || [8 * 60, 24 * 60];
    const [ini, fin] = ven;
    const jugables = ocup.filter(o => o.origen !== 'bloqueo');
    const minutosTot = C.canchas.length * (fin - ini);
    const minutosOcup = ocup.reduce((s, o) => s + o.canchas.length * (Math.min(o.hasta, fin) - Math.max(o.desde, ini)), 0);
    const senas = turnos.filter(x => x.fecha === F && ACTIVO(x) && x.origen === 'web' && x.pagoEstado === 'aprobado').length;
    let libres = 0;
    C.deportes.filter(d => !d.combinada).forEach(d => d.canchas.forEach(c => inicios(C, config.horarios, F, d.id).forEach(m => {
      if (F === ahora.fecha && m < ahora.min) return; if (F < ahora.fecha) return;
      if (libre(ocup, [c], F, m, m + d.duracion)) libres++;
    })));
    const pend = turnos.filter(x => x.estado === 'pendiente' && x.fecha >= H && x.origen === 'web');
    const prox = ocup.filter(o => o.origen !== 'bloqueo' && (F !== ahora.fecha || o.hasta > ahora.min));
    const abonosAct = abonos.filter(a => a.estado !== 'baja').sort((a, b) => ((a.dow + 6) % 7) - ((b.dow + 6) % 7) || a.hora - b.hora);

    main.innerHTML = `
      <div class="kad-head kad-head--row"><div><p class="kad-kicker">${esc(t('canGrilla'))}</p><h1>${esc(fLarga(F))}</h1></div>
        <div class="kad-est-acc"><button type="button" class="kit-btn kit-btn--ghost" data-c-bloq>${esc(t('canLluvia'))}</button><button type="button" class="kit-btn" data-c-nueva>+ ${esc(t('canManual'))}</button></div></div>
      <div class="kad-cd">
        <button type="button" class="kit-icon" data-c-mover="-1" aria-label="−1">‹</button>
        ${Array.from({ length: 7 }, (_, i) => fechaDeNum(diaNum(H) + i)).map(f => `<button type="button" class="kad-cd__d${f === F ? ' is-on' : ''}${f === H ? ' is-hoy' : ''}" data-c-fecha="${f}"><small>${esc(t('diasCortos')[diaSemana(f)])}</small><b>${Number(f.slice(8))}</b></button>`).join('')}
        <button type="button" class="kit-icon" data-c-mover="1" aria-label="+1">›</button>
      </div>
      <div class="kad-ck">
        <div><span>${esc(t('canTurnosHoy'))}</span><b>${jugables.length}</b></div>
        <div><span>${esc(t('canOcupacion'))}</span><b>${minutosTot ? Math.round(minutosOcup / minutosTot * 100) : 0}%</b></div>
        <div><span>${esc(t('canSenasCobradas'))}</span><b>${senas}</b></div>
        <div><span>${esc(t('canLibresAhora'))}</span><b class="is-ok">${libres}</b></div>
      </div>
      <section class="kad-card-box kad-cg-box">
        <div class="kad-cg-ley"><span class="kad-cb kad-cb--web">${esc(t('origen_web'))} · ${esc(t('canPagado').toLowerCase())}</span><span class="kad-cb kad-cb--webpend">${esc(t('origen_web'))} · ${esc(t('pendiente').toLowerCase())}</span><span class="kad-cb kad-cb--wa">WhatsApp / ${esc(t('origen_mostrador').toLowerCase())}</span><span class="kad-cb kad-cb--abono">★ ${esc(t('canAbonoLbl'))}</span><span class="kad-cb kad-cb--bloqueo">${esc(t('canBloqueado'))}</span><span class="kad-cg-ley__pico">${esc(t('canPico'))}</span></div>
        ${grilla(ocup, F, ini, fin)}
      </section>
      <div class="kad-est-cols kad-cc-cols">
        <section class="kad-card-box"><h2>${esc(t('canPendientes'))} ${pend.length ? `<b class="kad-est-n">${pend.length}</b>` : ''}</h2>${pend.length ? pend.map(x => tarjeta(x)).join('') : `<p class="kad-vacio">${esc(t('canSinPendientes'))}</p>`}</section>
        <section class="kad-card-box"><h2>${esc(t('canProximos'))}</h2>${prox.length ? prox.slice(0, 8).map(x => tarjeta(x)).join('') : `<p class="kad-vacio">${esc(t('canSinProximos'))}</p>`}</section>
      </div>
      <div class="kad-est-cols">
        <section class="kad-card-box"><div class="kad-cs-h"><h2>${esc(t('canAbonos'))}</h2><button type="button" class="kit-btn kit-btn--sm" data-c-abono>+ ${esc(t('canAbonoNuevo'))}</button></div>
          ${abonosAct.length ? `<ul class="kad-ca">${abonosAct.map(a => `<li><b>${esc(t('canSemana')[a.dow])} ${hhmm(a.hora)}</b><span>${esc(dep(a.deporte)?.combinada ? dep(a.deporte).nombre : nombreCancha(C, a.unidad))} · ${esc(a.nombre)}</span><button type="button" class="kit-btn kit-btn--sm kit-btn--ghost kit-btn--danger-t" data-c-baja="${esc(a.id)}">${esc(t('canDarBaja'))}</button></li>`).join('')}</ul>` : `<p class="kad-vacio">—</p>`}
        </section>
        <section class="kad-card-box"><h2>${esc(t('canTarifas'))}</h2>
          <div class="kad-est-scroll"><table class="kad-tf-tabla"><thead><tr><th></th><th scope="col">${esc(t('canNoPico'))}</th><th scope="col">${esc(t('canPico'))}</th></tr></thead><tbody>
          ${C.deportes.map(d => `<tr><th scope="row">${esc(d.nombre)}<small>${d.duracion % 60 ? `${Math.floor(d.duracion / 60)}:${String(d.duracion % 60).padStart(2, '0')} h` : `${d.duracion / 60} h`}</small></th>
            <td><input class="kad-tf" inputmode="numeric" data-c-tf="${esc(d.id)}|noPico" value="${tf[d.id]?.noPico ?? ''}" aria-label="${esc(`${d.nombre} · ${t('canNoPico')}`)}"></td>
            <td><input class="kad-tf" inputmode="numeric" data-c-tf="${esc(d.id)}|pico" value="${tf[d.id]?.pico ?? ''}" aria-label="${esc(`${d.nombre} · ${t('canPico')}`)}"></td></tr>`).join('')}
          ${C.extras.map(x => `<tr><th scope="row">${esc(x.nombre)}<small>${esc(t('canExtrasPrecio'))}</small></th><td colspan="2"><input class="kad-tf" inputmode="numeric" data-c-tfx="${esc(x.id)}" value="${tf.extras?.[x.id] ?? ''}" aria-label="${esc(x.nombre)}"></td></tr>`).join('')}
          </tbody></table></div>
          <div class="kad-est-tf__extra"><label class="kit-field"><span>${esc(t('canPicoDesde'))}</span><input class="kad-tf" type="time" step="1800" data-c-pico value="${esc(tf.picoDesde)}"></label>
            <label class="kit-field"><span>${esc(t('canSenaPct'))}</span><input class="kad-tf" inputmode="numeric" data-c-sena value="${tf.sena ?? ''}"></label></div>
          <p class="kad-hint">${esc(t('canPicoNota'))}</p>
        </section>
      </div>`;

    const buscar = (id) => ocup.find(o => o.id === id) || turnos.find(x => x.id === id);
    main.onclick = async (e) => {
      const mv = e.target.closest('[data-c-mover]'); if (mv) { st.fecha = fechaDeNum(diaNum(F) + Number(mv.dataset.cMover)); render(); return; }
      const fe = e.target.closest('[data-c-fecha]'); if (fe) { st.fecha = fe.dataset.cFecha; render(); return; }
      if (e.target.closest('[data-c-nueva]')) return formNueva({ fecha: F });
      if (e.target.closest('[data-c-bloq]')) return formBloqueo({ fecha: F, desde: F === ahora.fecha ? Math.max(ini, Math.ceil(ahora.min / 30) * 30) : ini, hasta: fin });
      if (e.target.closest('[data-c-abono]')) return formAbono();
      const baja = e.target.closest('[data-c-baja]');
      if (baja) { if (!(await confirmar(`${t('canDarBaja')}?`, { ok: t('canDarBaja'), peligro: true }))) return; await store.saveAbonoCancha({ id: baja.dataset.cBaja, estado: 'baja' }); toast(t('guardado')); render(); return; }
      const b = e.target.closest('[data-c-id]'); if (b) { detalle(buscar(b.dataset.cId)); return; }
      const fila = e.target.closest('[data-c-fila]');
      if (fila) {
        const r = fila.getBoundingClientRect(); const m = ini + ((e.clientX - r.left) / r.width) * (fin - ini);
        const c = fila.dataset.cFila; const d = dep(deportesDeCancha(C, c).find(id => !dep(id).combinada));
        const ins = d ? inicios(C, config.horarios, F, d.id) : []; const desde = ins.filter(x => x <= m).pop() ?? ins[0];
        formNueva({ fecha: F, deporte: d?.id, unidad: c, desde }); return;
      }
      const card = e.target.closest('[data-c-card]'); if (card) await accion(e, buscar(card.dataset.cCard));
    };
    main.onchange = async (e) => {
      if (!e.target.matches('.kad-tf')) return;
      const nuevo = JSON.parse(JSON.stringify(tf));
      $$('[data-c-tf]', main).forEach(inp => { const [d, k] = inp.dataset.cTf.split('|'); const v = inp.value.replace(/[^\d]/g, ''); nuevo[d] = { ...(nuevo[d] || {}), [k]: v === '' ? null : Number(v) }; inp.value = v; });
      $$('[data-c-tfx]', main).forEach(inp => { const v = inp.value.replace(/[^\d]/g, ''); nuevo.extras = { ...(nuevo.extras || {}), [inp.dataset.cTfx]: v === '' ? null : Number(v) }; inp.value = v; });
      nuevo.picoDesde = $('[data-c-pico]', main).value || C.pico.desde;
      nuevo.sena = Math.max(0, Math.min(100, Number($('[data-c-sena]', main).value) || 0));
      await store.saveTarifasCancha(nuevo); Object.assign(tf, nuevo); toast(t('guardado'));
    };
  }

  async function accion(e, x, p = null) {
    if (!x) return;
    const es = e.target.closest('[data-c-estado]');
    try {
      if (es) {
        if (es.dataset.cEstado === 'cancelada' && !(await confirmar(`${t('cancelar')}?`, { ok: t('cancelar'), peligro: true }))) return;
        await store.updateTurnoCancha(x.id, { estado: es.dataset.cEstado }); toast(t(es.dataset.cEstado === 'confirmada' ? 'confirmado' : 'cancelada')); p?.close(); render(); return;
      }
      if (e.target.closest('[data-c-cobre]')) { await store.updateTurnoCancha(x.id, { pagoEstado: 'cobrado' }); toast(t('cobrado')); p?.close(); render(); return; }
      if (e.target.closest('[data-c-novino]')) { await store.updateTurnoCancha(x.id, { estado: 'no_vino' }); toast(t('no_vino')); p?.close(); render(); return; }
      if (e.target.closest('[data-c-borrar]')) { await store.deleteTurnoCancha(x.id); p?.close(); render(); return; }
      if (e.target.closest('[data-c-liberar]')) {
        const ab = (await store.getAbonosCancha()).find(a => a.id === x.abono); if (!ab) return;
        await store.saveAbonoCancha({ id: ab.id, liberadas: [...(ab.liberadas || []), x.fecha] }); toast(t('guardado')); p?.close(); render();
      }
    } catch (err) { toast(t(err.code === 'sin_lugar' ? 'canOcupado' : 'error'), 'warn'); }
  }

  function detalle(x) {
    if (!x) return;
    const box = h(`<div class="kad-cdet">${tarjeta(x)}${x.origen !== 'abono' && x.origen !== 'bloqueo' && ACTIVO(x) && x.estado !== 'no_vino' ? `<div class="kit-row"><button type="button" class="kit-btn kit-btn--sm kit-btn--ghost" data-c-novino>${esc(t('canNoVino'))}</button></div>` : ''}</div>`);
    const p = popup({ titulo: `${t('canDetalle')} · ${hhmm(x.desde)}–${hhmm(x.hasta)}`, contenido: box, clase: 'kit-pop--sm' });
    box.addEventListener('click', (e) => accion(e, x, p));
  }

  // ---------- formularios
  const opcionesUnidad = (depId, sel) => unidades(C, depId).map(u => `<option value="${esc(u.id)}" ${u.id === sel ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('');
  const opcionesHora = (depId, fecha, sel) => inicios(C, config.horarios, fecha, depId).map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${hhmm(m)}</option>`).join('');

  function formNueva(ini = {}) {
    const d0 = dep(ini.deporte) ? ini.deporte : C.deportes[0]?.id;
    const f = h(`<form class="kit-form kad-est-form">
      <div class="kad-est-form__2"><label class="kit-field"><span>${esc(t('canDeporte'))}</span><select name="deporte">${C.deportes.map(d => `<option value="${esc(d.id)}" ${d.id === d0 ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('')}</select></label>
      <label class="kit-field"><span>${esc(t('canCancha'))}</span><select name="unidad">${opcionesUnidad(d0, ini.unidad)}</select></label></div>
      <div class="kad-est-form__2"><label class="kit-field"><span>${esc(t('canDia'))}</span><input type="date" name="fecha" value="${ini.fecha || hoy()}" required></label>
      <label class="kit-field"><span>${esc(t('canHora'))}</span><select name="desde">${opcionesHora(d0, ini.fecha || hoy(), ini.desde)}</select></label></div>
      <label class="kit-field"><span>${esc(t('nombre'))}</span><input name="nombre" autocomplete="off" required></label>
      <div class="kad-est-form__2"><label class="kit-field"><span>${esc(t('telefono'))}</span><input name="telefono" type="tel" inputmode="tel"></label>
      <label class="kit-field"><span>${esc(t('estOrigen'))}</span><select name="origen">${['whatsapp', 'mostrador'].map(o => `<option value="${o}">${esc(t(`origen_${o}`))}</option>`).join('')}</select></label></div>
      <p class="kit-msg" role="alert" hidden></p>
      <button class="kit-btn kit-btn--block kit-btn--big">${esc(t('guardar'))}</button></form>`);
    const p = popup({ titulo: t('canManual'), contenido: f, clase: 'kit-pop--sm' });
    const refrescar = () => { const dd = f.deporte.value; f.unidad.innerHTML = opcionesUnidad(dd, f.unidad.value); f.desde.innerHTML = opcionesHora(dd, f.fecha.value, Number(f.desde.value)); };
    f.addEventListener('change', (e) => { if (['deporte', 'fecha'].includes(e.target.name)) refrescar(); });
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); const d = Object.fromEntries(new FormData(f)); const msg = $('.kit-msg', f);
      try { await store.createTurnoCancha({ ...d, desde: Number(d.desde), pago: 'externo' }); p.close(); toast(t('guardado')); st.fecha = d.fecha; render(); }
      catch (err) { msg.textContent = t(err.code === 'sin_lugar' ? 'canOcupado' : 'error'); msg.hidden = false; }
    });
  }

  function formBloqueo(ini) {
    const horas = []; for (let m = 6 * 60; m <= 24 * 60; m += 30) horas.push(m);
    const sel = (name, v) => `<select name="${name}">${horas.map(m => `<option value="${m}" ${m === v ? 'selected' : ''}>${hhmm(m)}</option>`).join('')}</select>`;
    const f = h(`<form class="kit-form kad-est-form">
      <label class="kit-field"><span>${esc(t('canDia'))}</span><input type="date" name="fecha" value="${ini.fecha}" required></label>
      <div class="kad-est-form__2"><label class="kit-field"><span>${esc(t('canDesde'))}</span>${sel('desde', ini.desde)}</label><label class="kit-field"><span>${esc(t('canHasta'))}</span>${sel('hasta', ini.hasta)}</label></div>
      <fieldset class="kad-cbx"><legend class="kit-label">${esc(t('canCancha'))}</legend>
        <label><input type="checkbox" data-todas checked> ${esc(t('canTodas'))}</label>
        ${C.canchas.map(c => `<label><input type="checkbox" name="canchas" value="${esc(c.id)}" checked> ${esc(c.nombre)}</label>`).join('')}</fieldset>
      <label class="kit-field"><span>${esc(t('canMotivo'))}</span><input name="motivo" maxlength="40" value="lluvia"></label>
      <p class="kit-msg" role="alert" hidden></p>
      <button class="kit-btn kit-btn--block kit-btn--big">${esc(t('canBloquear'))}</button></form>`);
    const p = popup({ titulo: t('canBloquear'), contenido: f, clase: 'kit-pop--sm' });
    f.addEventListener('change', (e) => {
      if (e.target.matches('[data-todas]')) $$('[name=canchas]', f).forEach(c => { c.checked = e.target.checked; });
      else if (e.target.name === 'canchas') $('[data-todas]', f).checked = $$('[name=canchas]', f).every(c => c.checked);
    });
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); const msg = $('.kit-msg', f);
      const canchas = $$('[name=canchas]:checked', f).map(c => c.value);
      const fecha = f.fecha.value; const desde = Number(f.desde.value); const hasta = Number(f.hasta.value); const motivo = f.motivo.value.trim() || 'lluvia';
      if (!canchas.length || !(hasta > desde)) { msg.textContent = t('error'); msg.hidden = false; return; }
      const [turnos, abonos] = await Promise.all([store.getTurnosCancha(), store.getAbonosCancha()]);
      const afectados = ocupacionDia(turnos, abonos, fecha).filter(o => o.origen !== 'bloqueo' && o.canchas.some(c => canchas.includes(c)) && o.desde < hasta && desde < o.hasta);
      await store.createTurnoCancha({ origen: 'bloqueo', canchas, fecha, desde, hasta, motivo });
      st.fecha = fecha; render();
      if (!afectados.length) { p.close(); toast(t('guardado')); return; }
      p.setTitle(t('canAfectados'));
      p.body.innerHTML = `<div class="kad-cafect">${afectados.map(o => { const l = wa(o, 'canWALluvia', { motivo }); return `<div class="kad-cafect__i"><span><b>${hhmm(o.desde)} · ${esc(titulo(o))}</b>${esc(o.nombre || '')}</span>${l ? `<a class="kit-btn kit-btn--sm" href="${esc(l)}" target="_blank" rel="noopener">${esc(t('canAvisar'))}</a>` : `<small>${esc(t(`origen_${o.origen}`))}</small>`}</div>`; }).join('')}</div>`;
    });
  }

  function formAbono() {
    const d0 = C.deportes.find(d => !d.combinada)?.id || C.deportes[0]?.id;
    // una fecha cualquiera de ese día de la semana para calcular los horarios
    const fechaDow = (dow) => { const H = hoy(); return fechaDeNum(diaNum(H) + ((Number(dow) - diaSemana(H) + 7) % 7)); };
    const f = h(`<form class="kit-form kad-est-form">
      <div class="kad-est-form__2"><label class="kit-field"><span>${esc(t('canDeporte'))}</span><select name="deporte">${C.deportes.map(d => `<option value="${esc(d.id)}" ${d.id === d0 ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('')}</select></label>
      <label class="kit-field"><span>${esc(t('canCancha'))}</span><select name="unidad">${opcionesUnidad(d0)}</select></label></div>
      <div class="kad-est-form__2"><label class="kit-field"><span>${esc(t('canDiaSemana'))}</span><select name="dow">${[1, 2, 3, 4, 5, 6, 0].map(w => `<option value="${w}">${esc(t('canSemana')[w])}</option>`).join('')}</select></label>
      <label class="kit-field"><span>${esc(t('canHora'))}</span><select name="hora">${opcionesHora(d0, fechaDow(1), 20 * 60)}</select></label></div>
      <label class="kit-field"><span>${esc(t('nombre'))}</span><input name="nombre" autocomplete="off" required></label>
      <label class="kit-field"><span>${esc(t('telefono'))}</span><input name="telefono" type="tel" inputmode="tel"></label>
      <p class="kit-msg" role="alert" hidden></p>
      <button class="kit-btn kit-btn--block kit-btn--big">${esc(t('guardar'))}</button></form>`);
    const p = popup({ titulo: t('canAbonoNuevo'), contenido: f, clase: 'kit-pop--sm' });
    f.addEventListener('change', (e) => {
      if (!['deporte', 'dow'].includes(e.target.name)) return;
      f.unidad.innerHTML = opcionesUnidad(f.deporte.value, f.unidad.value); f.hora.innerHTML = opcionesHora(f.deporte.value, fechaDow(f.dow.value), Number(f.hora.value));
    });
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); const d = Object.fromEntries(new FormData(f)); const msg = $('.kit-msg', f);
      try { await store.saveAbonoCancha({ ...d, hora: Number(d.hora), dow: Number(d.dow), desde: hoy() }); p.close(); toast(t('guardado')); render(); }
      catch (err) { msg.textContent = t(err.code === 'sin_lugar' ? 'canOcupado' : 'error'); msg.hidden = false; }
    });
  }

  return { vista, pendientes: async () => (await store.getTurnosCancha()).filter(x => x.estado === 'pendiente' && x.origen === 'web' && x.fecha >= hoy()).length };
}
