/**
 * The language panel's engine, off the page's thread (DJ, 16 Oct 2026: "It
 * keeps freezing and pausing a lot, especially when I do any changes to the
 * actual languages"). Deriving a selected language can take seconds when its
 * family changed; here it no longer stops the chart, the dragging or the
 * typing. js/panel.js asks with { key, langId, presentYear, view, doc? } (the
 * chart only when it changed) and gets back { key, langId, html }.
 */

import { loadLangConfigs } from './lang-project.js';
import { langSectionsHtml, langViewState, preloadScripts, forgetPanelScripts } from './lang-panel.js';
import { buildModel } from './model.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let configs = null;
let model = null;
const queue = [];
let busy = false;

self.onmessage = (e) => {
    const msg = e.data;
    if (msg.forgetScripts) { forgetPanelScripts(); return; }   // a save rewrote data/scripts.json (js/panel.js)
    if (msg.doc) model = buildModel(msg.doc);   // a new chart: later asks use it
    // only the newest ask for a language matters: drop older ones still waiting
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].langId === msg.langId) queue.splice(i, 1);
    queue.push({ ...msg, model });
    pump();
};

async function pump() {
    if (busy) return;
    busy = true;
    try {
        configs ??= loadLangConfigs();
        await configs;
        await preloadScripts();   // the sample sentence in the language's own script (lang-panel.js scriptPreview)
        while (queue.length) {
            const { key, langId, presentYear, view, model: m } = queue.pop();   // the newest first
            queue.length = 0;                                                    // the rest are stale
            Object.assign(langViewState(), view);
            const lang = m?.byId.get(langId);
            let html = '';
            try {
                html = lang ? langSectionsHtml(m, lang, presentYear) : '';
            } catch (err) {
                html = `<div class="panel-section"><h3>Language</h3><div class="hint">Engine error: ${esc(err.message)}</div></div>`;
            }
            self.postMessage({ key, langId, html });
        }
    } finally {
        busy = false;
    }
}
