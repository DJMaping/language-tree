/**
 * Contact web: every way languages have touched each other, apart from
 * descent. Borrowings, substrates and superstrates, areal contact, a creole's
 * second parent, a constructed language's sources (Lastnu), and each family's
 * classical stratum. Drawn on a circle with the languages grouped by family,
 * arcs coloured by kind, and listed beneath. It fills out as Phase 5 adds the
 * world's history.
 */

import { esc } from '../views.js';
import { configFor } from '../lang-project.js';

const KINDS = {
    loan: { label: 'loanwords', color: 'hsl(210 65% 45%)' },
    substrate: { label: 'substrate', color: 'hsl(25 75% 45%)' },
    superstrate: { label: 'superstrate', color: 'hsl(340 60% 45%)' },
    areal: { label: 'areal', color: 'hsl(140 50% 35%)' },
    creole: { label: 'creole parent', color: 'hsl(280 50% 50%)' },
    source: { label: 'constructed from', color: 'hsl(0 0% 35%)' },
    learned: { label: 'classical (learned)', color: 'hsl(45 80% 40%)' },
};

export function render(el, ctx) {
    const { doc, model, palette, familyOf } = ctx;
    const edges = [];
    for (const b of doc.borrowings || []) edges.push({ from: b.fromId, to: b.toId, kind: b.kind || 'loan', year: b.year, label: b.label });
    for (const l of doc.languages) {
        if (l.secondaryParentId) edges.push({ from: l.secondaryParentId, to: l.id, kind: 'creole', year: l.born });
        for (const ep of l.extraParents || []) edges.push({ from: ep.id, to: l.id, kind: ep.role === 'source' ? 'source' : 'creole', year: l.born, label: ep.role });
    }
    // A family's classical stratum: its source lends learned words to the family's later languages.
    for (const r of model.languages.filter((l) => !l.parentId)) {
        const cfg = configFor(r.id, model);
        const src = cfg?.classical?.sourceId;
        if (src && model.byId.has(src)) edges.push({ from: src, to: r.id, kind: 'learned', year: cfg.classical.from, label: `learned words to the ${cfg.name} family, every ${cfg.classical.everyYears} years from ${cfg.classical.from}` });
    }
    const valid = edges.filter((e) => model.byId.has(e.from) && model.byId.has(e.to));

    // Languages on the circle, grouped by family.
    const ids = [...new Set(valid.flatMap((e) => [e.from, e.to]))];
    const famName = (id) => familyOf(id) ?? (model.byId.get(id)?.kind === 'constructed' ? 'Lastnu' : '?');
    ids.sort((a, b) => famName(a).localeCompare(famName(b)) || model.byId.get(a).name.localeCompare(model.byId.get(b).name));
    const R = 230, cx = 330, cy = 300;
    const pos = new Map(ids.map((id, i) => {
        const ang = (Math.PI * 2 * i) / Math.max(1, ids.length) - Math.PI / 2;
        return [id, { x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang), ang }];
    }));
    let svg = '';
    for (const e of valid) {
        const a = pos.get(e.from), b = pos.get(e.to);
        svg += `<path class="contact-arc" d="M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${cx},${cy} ${b.x.toFixed(1)},${b.y.toFixed(1)}" style="stroke:${KINDS[e.kind]?.color ?? 'gray'}"><title>${esc(model.byId.get(e.from).name)} → ${esc(model.byId.get(e.to).name)}: ${esc(KINDS[e.kind]?.label ?? e.kind)}${e.year != null ? `, ${e.year}` : ''}</title></path>`;
    }
    for (const id of ids) {
        const p = pos.get(id);
        const right = Math.cos(p.ang) >= 0;
        const lx = cx + (R + 10) * Math.cos(p.ang), ly = cy + (R + 10) * Math.sin(p.ang);
        svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5" style="fill:${palette.get(famName(id)) ?? 'gray'}"/>
          <text class="contact-label" x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${right ? 'start' : 'end'}" data-focus-lang="${esc(id)}">${esc(model.byId.get(id).name)}</text>`;
    }

    const name = (id) => esc(model.byId.get(id)?.name ?? id);
    el.innerHTML = `
      <div class="views-controls"><span class="hint">${valid.length} contacts between ${ids.length} languages. Phase 5 drafts the world's history (conquests, colonies, trade), which will fill this out.</span></div>
      <div class="views-split">
        <div class="views-main"><svg class="contact-svg" viewBox="0 0 660 600">${svg}</svg>
          <div class="views-legend">${Object.values(KINDS).map((k) => `<span class="lg"><i style="background:${k.color}"></i>${k.label}</span>`).join('')}</div></div>
        <div class="views-side"><h3>All contacts</h3><ul class="plain">${valid.sort((a, b) => (a.year ?? 0) - (b.year ?? 0)).map((e) =>
            `<li><button class="linklike" data-focus-lang="${esc(e.from)}">${name(e.from)}</button> → <button class="linklike" data-focus-lang="${esc(e.to)}">${name(e.to)}</button>
             <span class="hint">${esc(KINDS[e.kind]?.label ?? e.kind)}${e.year != null ? `, ${e.year}` : ''}${e.label && e.kind !== 'learned' ? `, ${esc(e.label)}` : ''}</span></li>`).join('')}</ul></div>
      </div>`;
}
