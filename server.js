// Andah Language Tree — zero-dependency local server (Node >= 20, built-ins only).
// Serves the static app, exposes the versioned data API, writes atomically with
// rolling backups, and pushes SSE change events so edits made in VS Code — by
// DJ or by Claude — refresh the open page live.
//
// Run: double-click start.bat (hidden server + its own app window, exits with
// the window), or `npm start` for a plain dev server + normal browser use.
//
// Flags:
//   --open       open the UI on startup, preferring an Edge/Chrome app-mode
//                window (no tabs / address bar — feels like a desktop program)
//   --auto-exit  quit automatically once the app window has closed

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { exec, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateDoc } from './js/validate.js';

// NOT 3000 — that's the andah_games dev server. --port=N runs a second copy beside DJ's open app (previews).
const PORT = Number((process.argv.find((x) => x.startsWith('--port=')) || '').slice(7)) || 4177;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(ROOT, 'data', 'languages.json');
const BACKUP_DIR = path.join(ROOT, 'backups');
const MAX_BACKUPS = 20;
const BODY_LIMIT = 10 * 1024 * 1024;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.otf': 'font/otf',
    '.ttf': 'font/ttf',
    '.woff2': 'font/woff2',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.md': 'text/plain; charset=utf-8',
};

let rev = 1;
let selfWrite = { hash: null, t: 0 }; // suppresses the watcher echo of our own saves
const sseClients = new Set();

// --- app-window launch + lifetime ------------------------------------------

const WANT_OPEN = process.argv.includes('--open');
const AUTO_EXIT = process.argv.includes('--auto-exit');

// Open as an app-mode window (own window, no browser chrome). Edge ships with
// Windows; fall back to Chrome, then to whatever the default browser is.
function openAppWindow() {
    const url = `http://localhost:${PORT}`;
    const size = '--window-size=1320,900';
    exec(`start "" msedge --app=${url} ${size}`, (err) => {
        if (!err) return;
        exec(`start "" chrome --app=${url} ${size}`, (err2) => {
            if (err2) exec(`start "" ${url}`);
        });
    });
}

// With --auto-exit the server's lifetime is tied to the app window: every open
// page holds an SSE connection, so "no SSE clients for a while" means the
// window was closed (the grace period rides out refreshes and reconnects).
let everConnected = false;
let idleTimer = null;

function armAutoExit() {
    if (!AUTO_EXIT) return;
    clearTimeout(idleTimer);
    if (sseClients.size > 0) return;
    idleTimer = setTimeout(() => {
        if (sseClients.size === 0) {
            console.log('App window closed — shutting down.');
            process.exit(0);
        }
    }, 45000);
}

if (AUTO_EXIT) {
    setTimeout(() => {
        if (!everConnected) {
            console.log('No app window ever connected — shutting down.');
            process.exit(0);
        }
    }, 180000);
}

const sha1 = buf => crypto.createHash('sha1').update(buf).digest('hex');

function hashFile() {
    try { return sha1(fs.readFileSync(DATA_FILE)); } catch { return null; }
}

let lastHash = hashFile();

function listBackups() {
    try { return fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort(); }
    catch { return []; }
}

function readDoc() {
    let text;
    try { text = fs.readFileSync(DATA_FILE, 'utf8'); }
    catch (e) { return { error: `Cannot read ${DATA_FILE}: ${e.message}` }; }
    try { return { doc: JSON.parse(text) }; }
    catch (e) { return { error: `Invalid JSON: ${e.message}` }; }
}

function writeDocAtomic(doc) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    if (fs.existsSync(DATA_FILE)) {
        const d = new Date();
        const pad = (n, l = 2) => String(n).padStart(l, '0');
        const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
            `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`;
        fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `languages-${stamp}.json`));
        const backups = listBackups();
        for (const old of backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS))) {
            try { fs.unlinkSync(path.join(BACKUP_DIR, old)); } catch { /* ignore */ }
        }
    }
    const text = JSON.stringify(doc, null, 2) + '\n';
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, DATA_FILE); // atomic replace; the file is never half-written
    const hash = sha1(Buffer.from(text));
    selfWrite = { hash, t: Date.now() };
    lastHash = hash;
}

function broadcast(obj) {
    const line = `data: ${JSON.stringify(obj)}\n\n`;
    for (const res of sseClients) {
        try { res.write(line); } catch { /* client went away */ }
    }
}

function sendJson(res, status, obj) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(obj));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', c => {
            size += c.length;
            if (size > BODY_LIMIT) { reject(new Error('Body too large')); req.destroy(); return; }
            chunks.push(c);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

// --- change detection: fs.watch for speed, a 2s stat poll for reliability ---
// (fs.watch on Windows fires duplicate/rename noise on editors' atomic saves;
// the debounce + content hash make it idempotent, the poll makes it certain.)

let watchDebounce = null;
function onMaybeChanged() {
    clearTimeout(watchDebounce);
    watchDebounce = setTimeout(() => {
        const hash = hashFile();
        if (hash === null || hash === lastHash) return;
        if (selfWrite.hash === hash && Date.now() - selfWrite.t < 2000) { lastHash = hash; return; }
        lastHash = hash;
        rev += 1;
        broadcast({ rev, source: 'external' });
        console.log(`[watch] external change -> rev ${rev}`);
    }, 300);
}

try {
    fs.watch(path.dirname(DATA_FILE), (event, file) => {
        if (!file || String(file).startsWith('languages.json')) onMaybeChanged();
    });
} catch { /* the stat poll below still covers us */ }

let lastStat = null;
setInterval(() => {
    try {
        const s = fs.statSync(DATA_FILE);
        const sig = `${s.mtimeMs}:${s.size}`;
        if (lastStat !== null && sig !== lastStat) onMaybeChanged();
        lastStat = sig;
    } catch { /* file briefly missing during an editor's atomic save */ }
}, 2000);

// --- HTTP -------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname); }
    catch { res.writeHead(400); return res.end('Bad request'); }

    if (pathname === '/api/data' && req.method === 'GET') {
        const r = readDoc();
        if (r.error) return sendJson(res, 500, { error: r.error, file: DATA_FILE, backups: listBackups().slice(-5).reverse() });
        return sendJson(res, 200, { rev, doc: r.doc });
    }

    if (pathname === '/api/data' && (req.method === 'PUT' || req.method === 'POST')) {
        let payload;
        try { payload = JSON.parse(await readBody(req)); }
        catch { return sendJson(res, 400, { errors: [{ path: '', message: 'Body must be JSON: { baseRev, doc }.' }] }); }
        if (payload?.baseRev !== rev) {
            return sendJson(res, 409, { rev, message: 'The file changed since this document was loaded.' });
        }
        const errors = validateDoc(payload.doc);
        if (errors.length) return sendJson(res, 400, { errors });
        try { writeDocAtomic(payload.doc); }
        catch (e) { return sendJson(res, 500, { error: `Write failed: ${e.message}` }); }
        rev += 1;
        broadcast({ rev, source: 'save' });
        return sendJson(res, 200, { rev });
    }

    if (pathname === '/api/version' && req.method === 'GET') {
        return sendJson(res, 200, { rev });
    }

    if (pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-store',
            'connection': 'keep-alive',
        });
        res.write('retry: 2000\n\n');
        sseClients.add(res);
        everConnected = true;
        clearTimeout(idleTimer);
        req.on('close', () => { sseClients.delete(res); armAutoExit(); });
        return;
    }

    // POST /api/open-polyglot { id } — launch the PolyGlot desktop app with the
    // language's .pgd file. Launcher path comes from ANDAH_POLYGLOT_PATH or
    // config.polyglotPath (a PolyGlot.exe or PolyGlot.jar); errors come back as
    // friendly JSON the UI toasts. Local single-user tool: spawning a
    // user-configured launcher with a local file is the intended action.
    if (pathname === '/api/open-polyglot' && req.method === 'POST') {
        let payload;
        try { payload = JSON.parse(await readBody(req)); }
        catch { return sendJson(res, 400, { error: 'Body must be JSON: { id }.' }); }
        const r = readDoc();
        if (r.error) return sendJson(res, 500, { error: r.error });
        const lang = (r.doc.languages ?? []).find(l => l.id === payload?.id);
        if (!lang) return sendJson(res, 404, { error: 'No such language.' });
        if (!lang.polyglotFile) {
            return sendJson(res, 400, { error: `${lang.name} has no PolyGlot file set — edit the language to add one.` });
        }
        const launcher = process.env.ANDAH_POLYGLOT_PATH || r.doc.config?.polyglotPath;
        if (!launcher) {
            return sendJson(res, 400, { error: 'Set the PolyGlot launcher path in Settings first (PolyGlot.exe or PolyGlot.jar).' });
        }
        const file = path.isAbsolute(lang.polyglotFile) ? lang.polyglotFile : path.join(ROOT, lang.polyglotFile);
        if (!fs.existsSync(launcher)) return sendJson(res, 400, { error: `PolyGlot launcher not found: ${launcher}` });
        if (!fs.existsSync(file)) return sendJson(res, 400, { error: `PolyGlot file not found: ${file}` });
        try {
            const isJar = /\.jar$/i.test(launcher);
            const cmd = isJar ? 'java' : launcher;
            const args = isJar ? ['-jar', launcher, file] : [file];
            // No shell → the file/launcher strings are never re-parsed for metacharacters.
            const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
            child.on('error', (e) => console.error(`[polyglot] launch failed: ${e.message}`));
            child.unref();
        } catch (e) {
            return sendJson(res, 500, { error: `Could not launch PolyGlot: ${e.message}` });
        }
        return sendJson(res, 200, { ok: true });
    }

    if (pathname.startsWith('/api/history/')) return historyApi(pathname, req, res);
    if (pathname.startsWith('/api/scripts/')) return scriptsApi(pathname, req, res);

    serveStatic(pathname, res);
});

// --- the yearly language map (scripts/build-years.py) --------------------------
// data/history/*.json are DJ's choices (in git); data/cache/years/ is rebuilt.
// The Python stages run as child processes without a shell; one at a time.

const HISTORY_DIR = path.join(ROOT, 'data', 'history');
let historyJob = null;

function writeJsonAtomic(file, obj) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 1)}\n`);
    fs.renameSync(tmp, file);
}

function runPython(args) {
    return new Promise((resolve) => {
        const child = spawn(process.env.ANDAH_PYTHON || 'python', [path.join(ROOT, 'scripts', 'build-years.py'), ...args], { cwd: ROOT });
        // Below normal priority (its worker processes inherit it), so a rebuild
        // never makes the app or the PC stall (DJ, 16 Oct 2026: "freezing and pausing").
        try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* not allowed here: run as is */ }
        let out = '';
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { out += d; });
        child.on('error', (e) => resolve({ code: -1, out: `Could not start Python: ${e.message}` }));
        child.on('close', (code) => resolve({ code, out: out.slice(-4000) }));
    });
}

// DJ's own yearly maps, full size, for "your original map" when zoomed in.
// They live outside the repository (Documents/Andah Hisotry/Every Year);
// a copy without them (the laptop) falls back to the small ones in git.
const EVERY_YEAR = process.env.ANDAH_EVERY_YEAR || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Documents', 'Andah Hisotry', 'Every Year');
let originals = null;
function originalOf(year) {
    if (!originals) {
        originals = new Map();
        for (const sub of ['AFA', 'BFA']) {
            let files = [];
            try { files = fs.readdirSync(path.join(EVERY_YEAR, sub)); } catch { continue; }
            for (const f of files) {
                const m = /^([\d,]+)\s*(AFA|BFA)\.png$/i.exec(f);
                if (!m) continue;
                const v = parseInt(m[1].replace(/,/g, ''), 10);
                originals.set(m[2].toUpperCase() === 'AFA' ? v : -v, path.join(EVERY_YEAR, sub, f));
            }
        }
    }
    return originals.get(year) || null;
}

async function historyApi(pathname, req, res) {
    const orig = /^\/api\/history\/original\/(-?\d+)$/.exec(pathname);
    if (orig && req.method === 'GET') {
        const file = originalOf(parseInt(orig[1], 10));
        if (!file) { res.writeHead(404); return res.end('No such map here.'); }
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'max-age=3600' });
        return fs.createReadStream(file).pipe(res);
    }
    let body = {};
    if (req.method !== 'GET') {
        try { body = JSON.parse((await readBody(req)) || '{}'); }
        catch { return sendJson(res, 400, { error: 'Body must be JSON.' }); }
    }
    // PUT /api/history/civs { changes: { key: { lang, how, note } } }: DJ's
    // choices only; names and years stay as the legends give them.
    if (pathname === '/api/history/civs' && req.method === 'PUT') {
        const file = path.join(HISTORY_DIR, 'civs.json');
        let doc;
        try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return sendJson(res, 500, { error: `Cannot read civs.json: ${e.message}` }); }
        let n = 0;
        for (const [key, ch] of Object.entries(body.changes || {})) {
            const c = doc.civs[key];
            if (!c) continue;
            for (const f of ['lang', 'how', 'note']) if (f in ch) c[f] = ch[f] ?? null;
            n++;
        }
        writeJsonAtomic(file, doc);
        return sendJson(res, 200, { ok: true, changed: n });
    }
    // PUT /api/history/contact-veto { id, veto }: a map contact (scripts/contact-strength.js) DJ
    // stops or lets lend words again; kept in data/history/contact.json across rebuilds.
    if (pathname === '/api/history/contact-veto' && req.method === 'PUT') {
        const file = path.join(HISTORY_DIR, 'contact.json');
        let doc;
        try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return sendJson(res, 500, { error: `Cannot read contact.json: ${e.message}` }); }
        const id = String(body.id || '');
        const all = [...(doc.map || []), ...(doc.borders || [])];
        if (!all.some((m) => m.id === id)) return sendJson(res, 404, { error: `No map contact ${id}` });
        const veto = new Set(doc.veto || []);
        if (body.veto) veto.add(id); else veto.delete(id);
        doc.veto = [...veto].sort();
        for (const m of all) { if (veto.has(m.id)) m.vetoed = true; else delete m.vetoed; }
        writeJsonAtomic(file, doc);
        return sendJson(res, 200, { ok: true, vetoed: doc.veto.length });
    }
    // PUT /api/history/decisions { decisions }: suggestions DJ turned down.
    if (pathname === '/api/history/decisions' && req.method === 'PUT') {
        writeJsonAtomic(path.join(HISTORY_DIR, 'decisions.json'), { _readme: 'Border suggestions DJ has dealt with, so they are not suggested again. Keyed a|b|from.', decisions: body.decisions || {} });
        return sendJson(res, 200, { ok: true });
    }
    if (pathname === '/api/history/decisions' && req.method === 'GET') {
        try { return sendJson(res, 200, JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, 'decisions.json'), 'utf8'))); }
        catch { return sendJson(res, 200, { decisions: {} }); }
    }
    // POST /api/history/rebuild: stage 2 (languages, borders, clashes).
    // POST /api/history/starter { year }: a keyframe to paint in Paint.NET.
    if ((pathname === '/api/history/rebuild' || pathname === '/api/history/starter') && req.method === 'POST') {
        if (historyJob) return sendJson(res, 409, { error: 'A rebuild is already running.' });
        const layer = body.layer === 'rulers' ? 'rulers' : 'commoners';
        const args = pathname.endsWith('rebuild') ? ['languages'] : ['starter', String(parseInt(body.year, 10)), layer];
        historyJob = runPython(args);
        const r = await historyJob;
        historyJob = null;
        return sendJson(res, r.code === 0 ? 200 : 500, { ok: r.code === 0, log: r.out });
    }
    return sendJson(res, 404, { error: 'No such history call.' });
}

// --- DJ's own hand in the scripts (js/engine/script/own.js) -----------------------
// data/scripts-own.json: signs he drew (by what they write) and hands he picked,
// written here by the Scripts window's editor and pick-one sheet; then the
// scripts and fonts are rebuilt. One rebuild at a time.

const OWN_FILE = path.join(ROOT, 'data', 'scripts-own.json');
const LOCK_FILE = path.join(ROOT, 'data', 'scripts-lock.json');
let scriptsJob = null;

function runNode(script, args = []) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, ['--max-old-space-size=8000', path.join(ROOT, 'scripts', script), ...args], { cwd: ROOT });
        try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* run as is */ }
        let out = '';
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { out += d; });
        child.on('error', (e) => resolve({ code: -1, out: `Could not start Node: ${e.message}` }));
        child.on('close', (code) => resolve({ code, out }));
    });
}

/** Strokes as the engine keeps them, or a reason they are not. */
function badStrokes(s) {
    if (!Array.isArray(s) || !s.length || s.length > 60) return 'a sign needs 1 to 60 strokes';
    for (const t of s) {
        if (!t || !Array.isArray(t.pts) || t.pts.length < 2 || t.pts.length > 400) return 'every stroke needs 2 to 400 points';
        if (!t.pts.every((q) => Array.isArray(q) && q.length === 2 && q.every((v) => Number.isFinite(v) && v > -1 && v < 2))) return 'points are [x, y] in the unit box';
    }
    return null;
}
const cleanStrokes = (s) => s.map((t) => ({ pts: t.pts.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]), curve: !!t.curve, closed: !!t.closed, ...(t.mark ? { mark: true } : {}), ...(t.headline ? { headline: true } : {}) }));

async function scriptsApi(pathname, req, res) {
    const readOwn = () => { try { return JSON.parse(fs.readFileSync(OWN_FILE, 'utf8')); } catch { return { stages: {} }; } };
    if (pathname === '/api/scripts/own' && req.method === 'GET') return sendJson(res, 200, { ...readOwn(), building: !!scriptsJob });
    // POST /api/scripts/own { signs: [{ stage, key, s, u }], styles: { stage: style|null }, marks: [{ stage, vowel, s }], numerals: [{ stage, value, s }], release: [{ stage, key }] }
    //   s / u: the small letter's (or only) strokes and the capital's; null hands that part back to the engine.
    //   release: lock entries dropped so the engine redraws them (a drawing carried down); locked again after.
    if (pathname === '/api/scripts/own' && req.method === 'POST') {
        if (scriptsJob) return sendJson(res, 409, { error: 'The scripts are already being rebuilt.' });
        let body;
        try { body = JSON.parse((await readBody(req)) || '{}'); } catch { return sendJson(res, 400, { error: 'Body must be JSON.' }); }
        const own = readOwn();
        own._readme = "DJ's own hand in the scripts (js/engine/script/own.js): signs he drew, by what they write (s: strokes, u: the capital's, via: drawn or from a hand he picked), hands he picked (style), and vowel marks and numerals he drew (marks, numerals). Written by the Scripts window; scripts/build-scripts.js draws them over the engine and the lock.";
        own.stages ||= {};
        const t0 = new Date().toISOString();
        for (const x of body.signs || []) {
            if (typeof x.stage !== 'string' || typeof x.key !== 'string') return sendJson(res, 400, { error: 'Each sign needs a stage and a key.' });
            for (const part of ['s', 'u']) if (x[part] != null) { const why = badStrokes(x[part]); if (why) return sendJson(res, 400, { error: `${x.stage} ${x.key}: ${why}.` }); }
            const st = (own.stages[x.stage] ||= {});
            const signs = (st.signs ||= {});
            const was = signs[x.key] || {};
            const next = { ...was, at: t0 };
            for (const part of ['s', 'u']) if (part in x) { if (x[part] == null) delete next[part]; else next[part] = cleanStrokes(x[part]); }
            if (['drawn', 'hand'].includes(x.via)) next.via = x.via;
            if (next.s || next.u) signs[x.key] = next; else delete signs[x.key];
        }
        for (const [stage, style] of Object.entries(body.styles || {})) {
            const st = (own.stages[stage] ||= {});
            if (style == null) delete st.style;
            else st.style = { aspect: +style.aspect || 1, slant: +style.slant || 0, round: +style.round || 0, headline: !!style.headline, tall: +style.tall || 0 };
        }
        // a vowel mark (by its vowel) or a numeral (by its value), drawn: s, or null to hand it back
        for (const [field, list, idOf] of [['marks', body.marks, (x) => x.vowel], ['numerals', body.numerals, (x) => x.value]]) {
            for (const x of list || []) {
                const id = idOf(x);
                if (typeof x.stage !== 'string' || id == null || id === '') return sendJson(res, 400, { error: `Each of the ${field} needs a stage and a ${field === 'marks' ? 'vowel' : 'value'}.` });
                if (x.s != null) { const why = badStrokes(x.s); if (why) return sendJson(res, 400, { error: `${x.stage} ${field} ${id}: ${why}.` }); }
                const st = (own.stages[x.stage] ||= {});
                const map = (st[field] ||= {});
                if (x.s == null) delete map[id]; else map[id] = { s: cleanStrokes(x.s), at: t0 };
            }
        }
        for (const [id, st] of Object.entries(own.stages)) {
            for (const f of ['signs', 'marks', 'numerals']) if (st[f] && !Object.keys(st[f]).length) delete st[f];
            if (!st.signs && !st.style && !st.marks && !st.numerals) delete own.stages[id];
        }
        // the file before, kept beside the data backups
        if (fs.existsSync(OWN_FILE)) { fs.mkdirSync(BACKUP_DIR, { recursive: true }); fs.copyFileSync(OWN_FILE, path.join(BACKUP_DIR, `scripts-own-${t0.replace(/[:.]/g, '-')}.json`)); }
        writeJsonAtomic(OWN_FILE, own);
        const release = (body.release || []).filter((r) => typeof r.stage === 'string' && typeof r.key === 'string');
        if (release.length && fs.existsSync(LOCK_FILE)) {
            const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
            for (const r of release) delete lock.stages?.[r.stage]?.signs?.[r.key];
            const tmp = LOCK_FILE + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(lock));
            fs.renameSync(tmp, LOCK_FILE);
        }
        // Drawn signs and picked hands go straight into data/scripts.json (patch-own.js, seconds); only a
        // drawing carried down, or a sign handed back that the lock cannot draw, needs the engine (many minutes).
        scriptsJob = (async () => {
            let log = '';
            const run = async (script, args = []) => {
                const r = await runNode(script, args);
                log += `$ node scripts/${script} ${args.join(' ')}\n${r.out.split('\n').filter((l) => /Lock|Own|Locked|Wrote|font|rror|warn/i.test(l)).slice(-12).join('\n')}\n`;
                return r;
            };
            const fail = (r) => ({ ok: false, log: `${log}\n${r.out.slice(-3000)}` });
            let full = release.length > 0;
            if (!full) {
                const r = await run('patch-own.js');
                if (r.code === 3) full = true;
                else if (r.code !== 0) return fail(r);
            }
            if (full) {
                const r = await run('build-scripts.js');
                if (r.code !== 0) return fail(r);
                if (release.length) { const k = await run('lock-scripts.js', ['--keep']); if (k.code !== 0) return fail(k); }
            }
            const f = await run('build-fonts.js');
            // a copy without its packages (npm install not run) keeps the scripts and says why the fonts are old
            if (f.code !== 0 && /ERR_MODULE_NOT_FOUND/.test(f.out)) return { ok: true, full, fonts: false, log: `${log}The fonts were not rebuilt: the font packages are not installed here (run npm install).\n` };
            if (f.code !== 0) return fail(f);
            return { ok: true, full, fonts: true, log };
        })();
        const r = await scriptsJob;
        scriptsJob = null;
        return sendJson(res, r.ok ? 200 : 500, r);
    }
    // The script history's proposed switches DJ strikes (scripts/build-script-history.js): GET the list,
    // PUT { vetoes: [{ lang, year }] } to save it and rebuild the history (about a second) and its sheet.
    const VETO_FILE = path.join(ROOT, 'data', 'history', 'script-vetoes.json');
    if (pathname === '/api/scripts/vetoes' && req.method === 'GET') {
        try { return sendJson(res, 200, { vetoes: JSON.parse(fs.readFileSync(VETO_FILE, 'utf8')) }); } catch { return sendJson(res, 200, { vetoes: [] }); }
    }
    if (pathname === '/api/scripts/vetoes' && req.method === 'PUT') {
        if (scriptsJob) return sendJson(res, 409, { error: 'The scripts are being rebuilt; try again when that is done.' });
        let body;
        try { body = JSON.parse((await readBody(req)) || '{}'); } catch { return sendJson(res, 400, { error: 'Body must be JSON.' }); }
        if (!Array.isArray(body.vetoes) || !body.vetoes.every((v) => typeof v?.lang === 'string' && Number.isInteger(v.year))) return sendJson(res, 400, { error: 'vetoes must be [{ lang, year }].' });
        const seen = new Set();
        const vetoes = body.vetoes.filter((v) => { const k = `${v.lang}|${v.year}`; if (seen.has(k)) return false; seen.add(k); return true; })
            .map((v) => ({ lang: v.lang, year: v.year })).sort((a, b) => a.lang.localeCompare(b.lang) || a.year - b.year);
        writeJsonAtomic(VETO_FILE, vetoes);
        scriptsJob = (async () => {
            const h = await runNode('build-script-history.js');
            // no religion map on this machine: the vetoes are kept, the history waits for a machine that has it
            if (h.code === 2) return { ok: false, saved: true, noMap: true, log: h.out };
            if (h.code !== 0) return { ok: false, saved: true, log: h.out.slice(-3000) };
            const p = await runNode('script-history-proposals.js');
            return { ok: p.code === 0, saved: true, log: `${h.out.split('\n').filter((l) => /Wrote|Religion map/.test(l)).join('\n')}\n${p.out}` };
        })();
        const r = await scriptsJob;
        scriptsJob = null;
        return sendJson(res, r.ok ? 200 : r.noMap ? 409 : 500, r);
    }
    return sendJson(res, 404, { error: 'No such scripts call.' });
}

function serveStatic(pathname, res) {
    const rel = pathname === '/' ? '/index.html' : pathname;
    const full = path.resolve(ROOT, '.' + rel);
    if (full !== ROOT && !full.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
    const mime = MIME[path.extname(full).toLowerCase()];
    if (!mime) { res.writeHead(404); return res.end('Not found'); }
    fs.readFile(full, (err, buf) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'content-type': mime, 'cache-control': 'no-store' });
        res.end(buf);
    });
}

const heartbeat = setInterval(() => {
    for (const res of sseClients) {
        try { res.write(': ping\n\n'); } catch { /* ignore */ }
    }
}, 25000);
heartbeat.unref?.();

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} is already in use — the app is probably already running.`);
        console.log(`Open http://localhost:${PORT}`);
        if (WANT_OPEN) openAppWindow();
        // Give the `start` command a moment to spawn the window before exiting.
        setTimeout(() => process.exit(0), 1500);
        return;
    }
    throw e;
});

server.listen(PORT, () => {
    console.log(`Andah Language Tree -> http://localhost:${PORT}`);
    console.log(`Data file: ${DATA_FILE}`);
    if (WANT_OPEN) openAppWindow();
});
