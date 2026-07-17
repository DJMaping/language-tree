// Andah Language Tree — zero-dependency local server (Node >= 20, built-ins only).
// Serves the static app, exposes the versioned data API, writes atomically with
// rolling backups, and pushes SSE change events so edits made in VS Code — by
// DJ or by Claude — refresh the open page live.
//
// Run: `npm start`, or double-click start.bat (adds --open).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateDoc } from './js/validate.js';

const PORT = 4177; // NOT 3000 — that's the andah_games dev server
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
    '.ico': 'image/x-icon',
    '.md': 'text/plain; charset=utf-8',
};

let rev = 1;
let selfWrite = { hash: null, t: 0 }; // suppresses the watcher echo of our own saves
const sseClients = new Set();

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
        req.on('close', () => sseClients.delete(res));
        return;
    }

    // FUTURE: POST /api/open-polyglot { id } — spawn the PolyGlot desktop app
    // with languages[id].polyglotFile. Deliberately not implemented yet; the
    // schema already reserves the polyglotFile field for it.

    serveStatic(pathname, res);
});

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
        if (process.argv.includes('--open')) exec(`start "" http://localhost:${PORT}`);
        process.exit(0);
    }
    throw e;
});

server.listen(PORT, () => {
    console.log(`Andah Language Tree -> http://localhost:${PORT}`);
    console.log(`Data file: ${DATA_FILE}`);
    if (process.argv.includes('--open')) exec(`start "" http://localhost:${PORT}`);
});
