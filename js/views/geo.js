/**
 * Drawing Andah's 172 countries for the map views.
 *
 * The outlines are DJ's, as the andah-atlas repository draws them
 * (data/canon/country-shapes.json), in longitude and latitude. A plain
 * equirectangular projection: the atlases use the same, so a country sits
 * where DJ is used to seeing it.
 */

import { esc } from '../views.js';

export function countryMap(shapes, { width = 1100, fill, title, selected } = {}) {
    const [x0, y0, x1, y1] = shapes.bounds;
    const k = width / (x1 - x0);
    const height = Math.round((y1 - y0) * k);
    const pt = ([x, y]) => `${((x - x0) * k).toFixed(1)},${((y1 - y) * k).toFixed(1)}`;
    const paths = Object.entries(shapes.shapes).map(([name, parts]) => {
        const d = parts.map((part) => `M${part.map(pt).join('L')}Z`).join('');
        const cls = `country${name === selected ? ' sel' : ''}`;
        return `<path class="${cls}" data-country="${esc(name)}" d="${d}" style="fill:${fill(name)}"><title>${esc(title ? title(name) : name)}</title></path>`;
    }).join('');
    return `<svg class="views-map" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      <rect class="sea" width="${width}" height="${height}"/>${paths}</svg>`;
}

/** A legend of swatches, with counts. */
export function legend(items) {
    return `<div class="views-legend">${items.map(({ label, color, count }) =>
        `<span class="lg"><i style="background:${color}"></i>${esc(label)}${count != null ? ` <span class="hint">${count}</span>` : ''}</span>`).join('')}</div>`;
}

/** The family with the largest share of a country, from DJ's map. */
export function majorityFamily(state) {
    const fs = state?.fs || {};
    return Object.keys(fs).sort((a, b) => fs[b] - fs[a])[0] ?? null;
}

export function majorityBranch(state) {
    return [...(state?.br || [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
