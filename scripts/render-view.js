/**
 * Renders one Views tab to a standalone HTML page (and, with --png, a picture
 * through headless Edge), without opening the app. For sending a view to
 * another device, or checking a view's output from the command line.
 *
 *   node scripts/render-view.js typology --state '{"feature":"tone"}' --out exports/typology.html --png
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildModel } from '../js/model.js';
import { TABS, familyPalette, familyIndex } from '../js/views.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const tabId = process.argv[2] || 'typology';
const state = JSON.parse(arg('--state', '{}'));
const out = path.resolve(root, arg('--out', `exports/${tabId}.html`));
const json = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

const tab = TABS.find((t) => t.id === tabId);
if (!tab) throw new Error(`No view called ${tabId}; views: ${TABS.map((t) => t.id).join(', ')}`);
const doc = json('data/languages.json');
const model = buildModel(doc);
/**
 * Just enough of a DOM for the views: they write innerHTML and look up the
 * containers they wrote. A looked-up container's innerHTML is spliced into
 * the page at that id; everything else (listeners) is a no-op.
 */
const el = {
    innerHTML: '',
    querySelector(sel) {
        const id = sel.startsWith('#') ? sel.slice(1) : null;
        return {
            addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, dataset: {}, style: {},
            set innerHTML(html) {
                if (!id) return;
                const re = new RegExp('(<(\\w+)[^>]*id="' + id + '"[^>]*>)([\\s\\S]*?)(</\\2>)');
                el.innerHTML = el.innerHTML.replace(re, (m, open, tag, inner, close) => `${open}${html}${close}`);
            },
            get innerHTML() { return ''; },
        };
    },
    querySelectorAll: () => [],
};
await tab.render(el, {
    model, doc, presentYear: doc.config.presentYear, state,
    shapes: json('data/canon/country-shapes.json'), atlas: json('data/canon/people-atlas-languages.json'),
    views: json('data/views.json'), earthShapes: json('data/canon/earth-shapes.json'), earth: json('data/canon/earth-typology.json'),
    palette: familyPalette(doc), familyOf: familyIndex(doc, model), rerender() {},
});
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `<!doctype html><html><head><meta charset="utf-8"><title>${tab.label}</title><style>${css}</style>
<style>body{margin:0;padding:12px;background:var(--bg);color:var(--text)} .views-side{max-height:none}</style></head>
<body><div class="views-body">${el.innerHTML}</div></body></html>\n`);
console.log(`Wrote ${path.relative(root, out)}`);

if (process.argv.includes('--png')) {
    const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
    if (!edge) throw new Error('Edge not found for --png');
    const png = out.replace(/\.html$/, '.png');
    execFileSync(edge, ['--headless', '--disable-gpu', '--hide-scrollbars', `--screenshot=${png}`, `--window-size=${arg('--size', '1500,2300')}`, pathToFileURL(out).href], { stdio: 'ignore' });
    console.log(`Wrote ${path.relative(root, png)}`);
}
