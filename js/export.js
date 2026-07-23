// Image export. Renders the whole tree (respecting collapse state) into a
// detached SVG using the normal renderer, inlines the theme colors and the
// SVG-relevant CSS rules so the file stands alone, then downloads it as SVG or
// rasterizes it to PNG via a canvas. Zero-dependency, same-origin only.

import { render } from './view.js';
import { GUTTER_W, BOX_H } from './layout.js';
import { downloadBlob } from './api.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const PAD = 40;
const MAX_SIDE = 12000; // canvas/serialize sanity cap

// Theme tokens the SVG rules and inline styles resolve against.
const VARS = [
    '--bg', '--bg-soft', '--bg-sunken', '--text', '--muted', '--link', '--link-hover',
    '--border', '--border-soft', '--serif', '--sans',
    '--wrong-border', '--wrong-text', '--correct-border',
    '--fam-0', '--fam-1', '--fam-2', '--fam-3', '--fam-4', '--fam-5', '--fam-6', '--fam-7',
];

// Selectors worth copying into the standalone file (the SVG scene only).
const SVG_HINTS = ['.lang', '.conn-', '.extinct', '.grid-line', '.tick', '.present',
    '.borrow', '.event', '.scrub', '.gutter', '.collapse-badge', '.ghost', '.circa', '.vit', '.fold-mark', 'marker'];

function resolvedVarsBlock() {
    const cs = getComputedStyle(document.documentElement);
    const decls = VARS.map(v => `${v}:${cs.getPropertyValue(v).trim()}`).join(';');
    return `svg{${decls}}`;
}

function svgCssRules() {
    const out = [];
    for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; } // cross-origin — skip
        if (!rules) continue;
        for (const rule of rules) {
            const sel = rule.selectorText;
            if (!sel) continue;
            if (SVG_HINTS.some(h => sel.includes(h))) out.push(rule.cssText);
        }
    }
    return out.join('\n');
}

// Build a fitted view + canvas size that frames the whole (visible) tree.
function exportView(model, layout, config, basePpy) {
    const b = layout.bounds;
    const maxYear = Math.max(b.maxYear, config?.presentYear ?? b.maxYear);
    // The renderer maps years through the model's time warp (folded quiet
    // stretches), so the frame is sized/panned in warped years too.
    const span = Math.max(model.warp(maxYear) - model.warp(b.minYear), 1);
    let ppy = basePpy;
    if (span * ppy + 2 * PAD + BOX_H > MAX_SIDE) ppy = (MAX_SIDE - 2 * PAD - BOX_H) / span;
    const contentW = b.maxX - b.minX;
    const w = Math.min(MAX_SIDE, Math.ceil(contentW + 2 * PAD + (GUTTER_W)));
    const h = Math.ceil(span * ppy + 2 * PAD + BOX_H);
    // Pan so the leftmost box sits PAD past the gutter and the earliest year sits PAD down.
    const panX = GUTTER_W + PAD - b.minX;
    const panY = PAD - model.warp(b.minYear) * ppy;
    return { view: { pxPerYear: ppy, panX, panY }, w, h, clamped: ppy < basePpy };
}

function buildSvg(state) {
    const { model, layout } = state;
    const config = state.doc?.config;
    const ev = exportView(model, layout, config, state.view.pxPerYear);
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('xmlns', SVGNS);
    svg.setAttribute('width', ev.w);
    svg.setAttribute('height', ev.h);
    svg.setAttribute('viewBox', `0 0 ${ev.w} ${ev.h}`);

    // Clean context: no selection, hover, highlight, or scrub in the exported image.
    render(svg, { model, layout, view: ev.view, config, w: ev.w, h: ev.h });

    const style = document.createElementNS(SVGNS, 'style');
    style.textContent = resolvedVarsBlock() + '\n' + svgCssRules();
    const bg = document.createElementNS(SVGNS, 'rect');
    bg.setAttribute('x', 0); bg.setAttribute('y', 0);
    bg.setAttribute('width', ev.w); bg.setAttribute('height', ev.h);
    bg.setAttribute('fill', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#ffffff');
    svg.insertBefore(bg, svg.firstChild);
    svg.insertBefore(style, svg.firstChild);

    return { svg, w: ev.w, h: ev.h, clamped: ev.clamped };
}

function serialize(svg) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg);
}

function stamp() {
    // Date.* is fine in the browser; used only for the filename.
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export function exportSvg(state) {
    const { svg } = buildSvg(state);
    downloadBlob(`andah-language-tree-${stamp()}.svg`, new Blob([serialize(svg)], { type: 'image/svg+xml' }));
    return true;
}

export function exportPng(state, scale = 2) {
    const { svg, w, h } = buildSvg(state);
    const src = serialize(svg);
    const url = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml' }));
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const cw = Math.min(MAX_SIDE, Math.round(w * scale));
            const ch = Math.min(MAX_SIDE, Math.round(h * scale));
            const canvas = document.createElement('canvas');
            canvas.width = cw; canvas.height = ch;
            const g = canvas.getContext('2d');
            g.drawImage(img, 0, 0, cw, ch);
            URL.revokeObjectURL(url);
            canvas.toBlob(blob => {
                if (!blob) { reject(new Error('PNG encode failed')); return; }
                downloadBlob(`andah-language-tree-${stamp()}.png`, blob);
                resolve(true);
            }, 'image/png');
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not rasterize the SVG.')); };
        img.src = url;
    });
}
