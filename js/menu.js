// Lightweight context-menu component. showMenu() renders items at a screen
// position (clamped to the window) and closes on outside click, Esc, wheel,
// resize, or opening another menu. Items run their callback after closing.

const host = document.getElementById('ctxmenu');

let closeCurrent = null;

export function closeMenu() {
    if (closeCurrent) { closeCurrent(); return true; }
    return false;
}

export function isMenuOpen() { return closeCurrent != null; }

// items: array of { label, run, danger?, disabled?, kbd?, hint? } or the string 'sep'.
export function showMenu(clientX, clientY, items) {
    closeMenu();
    host.innerHTML = '';
    host.hidden = false;

    for (const it of items) {
        if (it === 'sep') {
            const s = document.createElement('div');
            s.className = 'menu-sep';
            host.appendChild(s);
            continue;
        }
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'menu-item' + (it.danger ? ' danger' : '');
        b.disabled = !!it.disabled;
        if (it.hint) b.title = it.hint;
        const label = document.createElement('span');
        label.textContent = it.label;
        b.appendChild(label);
        if (it.kbd) {
            const k = document.createElement('span');
            k.className = 'menu-kbd';
            k.textContent = it.kbd;
            b.appendChild(k);
        }
        b.addEventListener('click', () => { close(); it.run?.(); });
        host.appendChild(b);
    }

    // Position after measuring, clamped inside the window.
    const pad = 6;
    host.style.left = '0px';
    host.style.top = '0px';
    const r = host.getBoundingClientRect();
    host.style.left = Math.max(pad, Math.min(clientX, window.innerWidth - r.width - pad)) + 'px';
    host.style.top = Math.max(pad, Math.min(clientY, window.innerHeight - r.height - pad)) + 'px';

    const onDown = (e) => { if (!host.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const onAway = () => close();

    function close() {
        host.hidden = true;
        host.innerHTML = '';
        document.removeEventListener('pointerdown', onDown, true);
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('wheel', onAway, true);
        window.removeEventListener('resize', onAway);
        closeCurrent = null;
    }

    closeCurrent = close;
    // Attach on the next tick so the opening right-click itself doesn't close it.
    setTimeout(() => {
        if (closeCurrent !== close) return;
        document.addEventListener('pointerdown', onDown, true);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('wheel', onAway, true);
        window.addEventListener('resize', onAway);
    }, 0);
}
