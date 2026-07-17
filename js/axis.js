// Adaptive year axis: tick step picked from the current zoom so labels walk
// centuries -> decades -> individual years. All output is SVG strings composed
// by view.js.

import { GUTTER_W } from './layout.js';

const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const MIN_LABEL_PX = 24;
const MIN_MINOR_PX = 6;

export function chooseStep(pxPerYear) {
    for (const s of STEPS) {
        if (s * pxPerYear >= MIN_LABEL_PX) return s;
    }
    return STEPS[STEPS.length - 1];
}

export function renderAxisParts({ w, h, pxPerYear, panY, zeroLabel, presentYear, scrubYear }) {
    const screenY = year => year * pxPerYear + panY;
    const yearAt = py => (py - panY) / pxPerYear;
    const fmt = y => (y === 0 ? zeroLabel : String(y));

    const step = chooseStep(pxPerYear);
    const startYear = yearAt(-10);
    const endYear = yearAt(h + 10);

    let grid = '';
    let gutter = `<rect class="gutter-bg" x="0" y="0" width="${GUTTER_W}" height="${h}"/>` +
        `<line class="gutter-edge" x1="${GUTTER_W}" y1="0" x2="${GUTTER_W}" y2="${h}"/>`;

    // Minor (unlabeled) ticks at step/5 when they have room.
    const minor = step / 5;
    if (Number.isInteger(minor) && minor * pxPerYear >= MIN_MINOR_PX) {
        for (let y = Math.ceil(startYear / minor) * minor; y <= endYear; y += minor) {
            if (y % step === 0) continue;
            const py = screenY(y);
            gutter += `<line class="tick-minor" x1="${GUTTER_W - 4}" y1="${py}" x2="${GUTTER_W}" y2="${py}"/>`;
        }
    }

    // Labeled ticks + full-width gridlines.
    for (let y = Math.ceil(startYear / step) * step; y <= endYear; y += step) {
        const py = screenY(y);
        grid += `<line class="grid-line" x1="${GUTTER_W}" y1="${py}" x2="${w}" y2="${py}"/>`;
        gutter += `<line class="tick-mark" x1="${GUTTER_W - 7}" y1="${py}" x2="${GUTTER_W}" y2="${py}"/>` +
            `<text class="tick-label" x="${GUTTER_W - 11}" y="${py + 3.5}">${fmt(y)}</text>`;
    }

    // Present-day rule + a chip in the gutter.
    let presentLine = '';
    if (Number.isInteger(presentYear)) {
        const py = screenY(presentYear);
        if (py > -20 && py < h + 20) {
            presentLine = `<line class="present-line" x1="${GUTTER_W}" y1="${py}" x2="${w}" y2="${py}"/>`;
            gutter += `<g><rect class="present-chip-bg" x="3" y="${py - 8}" width="${GUTTER_W - 6}" height="16" rx="8"/>` +
                `<text class="present-chip-text" x="${GUTTER_W / 2}" y="${py + 3.5}">Now ${fmt(presentYear)}</text></g>`;
        }
    }

    // Draggable year scrubber: a highlighted rule + a grabbable gutter chip.
    let scrubSvg = '';
    if (Number.isInteger(scrubYear)) {
        const py = screenY(scrubYear);
        scrubSvg =
            `<line class="scrub-line" x1="${GUTTER_W}" y1="${py}" x2="${w}" y2="${py}"/>` +
            `<g class="scrub-chip" data-scrub="1">` +
            `<rect class="scrub-hit" x="0" y="${py - 12}" width="${GUTTER_W}" height="24"/>` +
            `<rect class="scrub-chip-bg" x="3" y="${py - 8}" width="${GUTTER_W - 6}" height="16" rx="8"/>` +
            `<text class="scrub-chip-text" x="${GUTTER_W / 2}" y="${py + 3.5}">${fmt(scrubYear)}</text></g>`;
    }

    return { gridSvg: grid, gutterSvg: gutter, presentLineSvg: presentLine, scrubSvg };
}
