// Thin wrappers around the local server API, SSE subscription, and toasts.

export async function fetchData() {
    try {
        const r = await fetch('/api/data', { cache: 'no-store' });
        const body = await r.json().catch(() => null);
        return { status: r.status, body };
    } catch {
        return { status: 0, body: null };
    }
}

export async function saveData(baseRev, doc) {
    try {
        const r = await fetch('/api/data', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ baseRev, doc }),
        });
        const body = await r.json().catch(() => null);
        return { status: r.status, body };
    } catch {
        return { status: 0, body: null };
    }
}

export function subscribeEvents(onEvent) {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
        try { onEvent(JSON.parse(e.data)); } catch { /* ignore malformed */ }
    };
    es.onopen = async () => {
        // After (re)connecting we may have missed events — resync with the server rev.
        try {
            const r = await fetch('/api/version', { cache: 'no-store' });
            const j = await r.json();
            if (Number.isInteger(j?.rev)) onEvent({ rev: j.rev, source: 'resync' });
        } catch { /* server down; EventSource retries on its own */ }
    };
    return es;
}

export function toast(msg, kind = 'ok') {
    const host = document.getElementById('toasts');
    if (!host) return;
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => el.remove(), 4200);
}

// Generic Blob download (same a[download] idiom as the andah_games tools).
export function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// "Download backup" — a copy of the current document as JSON.
export function downloadDoc(doc) {
    downloadBlob('languages.json', new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' }));
}

// Ask the server to launch PolyGlot with a language's .pgd file.
export async function openPolyglot(id) {
    try {
        const r = await fetch('/api/open-polyglot', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        const body = await r.json().catch(() => null);
        return { status: r.status, body };
    } catch {
        return { status: 0, body: null };
    }
}
