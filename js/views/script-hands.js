/**
 * The pick-one sheet (docs/writing-systems-plan.md, step 6: "for each new
 * script you pick from four candidate styles, as the name forge offers
 * names"). A hand is a branch's way of writing every sign alike: how wide,
 * how much it leans, round or angular, hung from a line or not
 * (evolve.js houseStyle). The sheet shows the stage's hand beside three more
 * drawn the way the engine draws a branch's own hand from its parent's, each
 * on the same signs; DJ picks one, and it is kept in data/scripts-own.json
 * with the signs in it, so it wins over the lock. Carried down, the later
 * scripts move by the same step (their own hands are their parent's and a
 * little more).
 */

import { esc } from '../views.js';
import { toPath, decodeStrokes } from '../engine/script/strokes.js';
import { houseStyle } from '../engine/script/evolve.js';
import { derive } from '../engine/rng.js';
import { stageKeys, stagesBelow, restyle, handWords, round2 } from '../engine/script/own.js';

const NEUTRAL = { aspect: 1, slant: 0, round: 0, headline: false, tall: 0 };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const typedOf = (st) => st.ductus === 'type' || st.ductus === 'roman';
const glyphOf = (x) => (x.strokes ? { strokes: x.strokes } : x.d ? decodeStrokes(x.d) : null);

/** A hand moved by the step from `from` to `to` (the later scripts follow their parent's new hand). */
function moved(style, from, to) {
    return {
        aspect: clamp(style.aspect + (to.aspect - from.aspect), 0.8, 1.25),
        slant: clamp(style.slant + (to.slant - from.slant), 0, 0.14),
        round: clamp(style.round + (to.round - from.round), -1, 1),
        headline: to.headline !== from.headline ? to.headline : style.headline,
        tall: clamp((style.tall ?? 0) + ((to.tall ?? 0) - (from.tall ?? 0)), 0, 0.3),
    };
}

/** Every sign of a stage in a new hand, as entries for data/scripts-own.json; a sign DJ drew himself stays as he drew it. */
function stageIn(st, to) {
    const from = st.style || NEUTRAL;
    const keys = stageKeys(st.signs);
    const typed = typedOf(st);
    return st.signs.map((x) => {
        const g = glyphOf(x);
        if (!g || x.own === 'drawn') return null;
        return { stage: st.id, key: keys.get(x.id), s: round2(restyle(g, from, to, { typed }).strokes), ...(x.upperStrokes ? { u: round2(restyle({ strokes: x.upperStrokes }, from, to, { typed }).strokes) } : {}), via: 'hand' };
    }).filter(Boolean);
}

export function renderHands(body, { stage, stages, state, valueOf, onSaved }) {
    if (stage.logographic) { body.innerHTML = '<div class="hint">Word-sign scripts take their look from their pen and their reforms, not from a hand: draw their signs one at a time instead.</div>'; return; }
    const byId = new Map(stages.map((s) => [s.id, s]));
    const parent = byId.get(stage.parent);
    const parentStyle = parent?.style || null;
    const current = stage.style || NEUTRAL;
    const typed = typedOf(stage);
    state.handRound ??= 0;
    if (state.handStage !== stage.id) { state.handStage = stage.id; state.handRound = 0; }
    const draws = Array.from({ length: 3 }, (_, k) => {
        const d = houseStyle(derive('scripts/pick', stage.id, String(state.handRound * 3 + k)), parentStyle, 0.35);
        return typed ? { ...d, slant: 0 } : d;
    });
    const candidates = [{ style: current, now: true }, ...draws.map((style) => ({ style }))];
    // the same signs on every card: the commonest letters first, as a type specimen shows them
    const sample = stage.signs.filter((x) => glyphOf(x)).slice(0, 18);
    const below = stagesBelow(stages, stage.id).filter((s) => !s.logographic);
    // this stage, if its hand was picked, and the later ones a pick was carried to
    const isPicked = (st) => !!st.engineStyle || st.signs.some((x) => x.own === 'hand');
    const picked = isPicked(stage) ? [stage, ...below.filter(isPicked)] : [];
    const card = (c, i) => {
        const words = c.now ? (handWords(current, parentStyle || NEUTRAL).join(', ') || 'as its parent writes') : (handWords(c.style, current).join(', ') || 'close to the hand it has');
        const signs = sample.map((x) => {
            const g = c.now ? glyphOf(x) : restyle(glyphOf(x), current, c.style, { typed });
            return `<svg class="sc-glyph" viewBox="0 0 100 100" width="34" height="34"><path d="${toPath(g, stage.ductus, 100)}"/></svg>`;
        }).join('');
        return `<div class="sh-card${c.now ? ' now' : ''}">
          <div class="sh-head"><b>${c.now ? 'The hand it has' : `Hand ${i}`}</b> <span class="hint">${esc(words)}</span></div>
          <div class="sh-signs${stage.direction === 'rtl' ? ' rtl' : ''}">${signs}</div>
          <div class="hint">width ${c.style.aspect.toFixed(2)} · lean ${c.style.slant.toFixed(2)} · ${c.style.round > 0.35 ? 'round' : c.style.round < -0.35 ? 'angular' : 'between round and angular'}${c.style.headline ? ' · hung from a line' : ''}</div>
          ${c.now ? '' : `<button class="btn" data-pick="${i - 1}">Use this hand</button>`}
        </div>`;
    };
    body.innerHTML = `<div class="hint">${esc(stage.name)}'s hand beside three more, each drawn as the engine draws a branch's own hand from ${parent ? esc(parent.name) + "'s" : 'nothing'}, on the same ${sample.length} signs.${typed ? ' A printed face stands upright, so none of them lean.' : ''} Pick one, or draw three more.</div>
      <div class="sh-grid">${candidates.map(card).join('')}</div>
      <div class="views-controls">
        <button class="btn" id="sh-more">Draw three more</button>
        ${below.length ? `<label><input type="checkbox" id="sh-carry"${state.handCarry ? ' checked' : ''}> and carry it down: the ${below.length} later script${below.length > 1 ? 's' : ''} that come from it (${esc(below.slice(0, 5).map((s) => s.name).join(', '))}${below.length > 5 ? ' …' : ''}) move by the same step</label>` : ''}
        ${picked.length ? `<button class="btn" id="sh-drop" title="every sign that is only in a hand you picked goes back to the engine's locked shape, here${picked.length > 1 ? ' and in the later scripts it was carried to' : ''}; signs you drew stay">Back to the engine's hand${picked.length > 1 ? ` (${picked.length} scripts)` : ''}</button>` : ''}
      </div>
      <div class="hint" id="sh-status">Signs you drew yourself, the vowel marks and the numerals keep their shapes. Saving writes the signs into the scripts and rebuilds the fonts (well under a minute).</div>`;

    body.querySelector('#sh-more').addEventListener('click', () => { state.handRound += 1; renderHands(body, { stage, stages, state, valueOf, onSaved }); });
    body.querySelector('#sh-carry')?.addEventListener('change', (e) => { state.handCarry = e.target.checked; });
    const send = async (payload, what) => {
        const status = body.querySelector('#sh-status');
        body.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        const t0 = Date.now();
        const tick = setInterval(() => { status.textContent = `${what}: writing the scripts and rebuilding the fonts… ${Math.round((Date.now() - t0) / 1000)} s`; }, 500);
        try {
            const r = await fetch('/api/scripts/own', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }).then((x) => x.json());
            clearInterval(tick);
            if (!r.ok) { status.innerHTML = `<span class="ge-warn">The rebuild failed.</span><pre class="ge-log">${esc(r.log || r.error)}</pre>`; body.querySelectorAll('button').forEach((b) => { b.disabled = false; }); return; }
            onSaved(r.log);
        } catch (err) {
            clearInterval(tick);
            status.innerHTML = `<span class="ge-warn">Could not reach the app's server (${esc(err.message)}).</span>`;
            body.querySelectorAll('button').forEach((b) => { b.disabled = false; });
        }
    };
    body.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
        const to = draws[+b.dataset.pick];
        const signs = stageIn(stage, to);
        const styles = { [stage.id]: to };
        if (state.handCarry) {
            // each later script's hand moves by the step its parent's moved, and its signs with it
            const newStyle = new Map([[stage.id, to]]);
            for (const st of below) {
                const p = byId.get(st.parent);
                const pOld = p.style || NEUTRAL, pNew = newStyle.get(p.id) || pOld;
                let next = moved(st.style || NEUTRAL, pOld, pNew);
                if (typedOf(st)) next = { ...next, slant: 0 };
                newStyle.set(st.id, next);
                styles[st.id] = next;
                signs.push(...stageIn(st, next));
            }
        }
        send({ signs, styles }, `${stage.name} in hand ${+b.dataset.pick + 1}`);
    }));
    body.querySelector('#sh-drop')?.addEventListener('click', () => {
        const signs = picked.flatMap((st) => { const keys = stageKeys(st.signs); return st.signs.filter((x) => x.own === 'hand').map((x) => ({ stage: st.id, key: keys.get(x.id), s: null, u: null })); });
        send({ signs, styles: Object.fromEntries(picked.map((st) => [st.id, null])) }, `${stage.name} back to the engine's hand`);
    });
}
