// CLI: `npm test` — unit tests for the pure logic the timeline-accuracy
// features rely on: schema validation of the newer language fields
// (reconstructed / bornCirca / diedCirca / diverged / populationSeries / region)
// and the vitality derivation in model.js (vitalityOf / vitalityAt).
//
// Zero-dependency, same spirit as scripts/validate.js — just imports the shared
// browser modules (they are DOM-free) and asserts against them.

import { validateDoc } from '../js/validate.js';
import { buildModel } from '../js/model.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error(`  FAIL: ${msg}`); } };
const eq = (a, b, msg) => ok(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
const hasErr = (errors, path) => errors.some(e => e.path === path);

// A minimal valid document; each test tweaks a clone.
const base = () => ({ config: { presentYear: 1765 }, languages: [{ id: 'a', name: 'A', born: 0 }], borrowings: [], events: [] });
const modelOf = (languages) => buildModel({ config: { presentYear: 1765 }, languages });

// --- validation: new optional language fields -----------------------------

eq(validateDoc(base()).length, 0, 'baseline doc is valid');

{
    const d = base(); d.languages[0].reconstructed = 'yes';
    ok(hasErr(validateDoc(d), 'languages[0].reconstructed'), 'non-boolean reconstructed is flagged');
}
{
    const d = base(); d.languages[0].bornCirca = 1;
    ok(hasErr(validateDoc(d), 'languages[0].bornCirca'), 'non-boolean bornCirca is flagged');
}
{
    const d = base(); d.languages[0].diedCirca = 'x';
    ok(hasErr(validateDoc(d), 'languages[0].diedCirca'), 'non-boolean diedCirca is flagged');
}
{
    const d = base(); d.languages[0].diverged = 'x';
    ok(hasErr(validateDoc(d), 'languages[0].diverged'), 'non-boolean diverged is flagged');
}
{
    const d = base(); d.languages[0].diverged = true; // no died
    ok(hasErr(validateDoc(d), 'languages[0].diverged'), 'diverged without a died year is flagged');
}
{
    const d = base(); d.languages[0].died = 100; d.languages[0].diverged = true;
    eq(validateDoc(d).length, 0, 'diverged with a died year is valid');
}
{
    // "Evolved away" needs no death date when a successor supplies the end year:
    // a stage successor counts, not only a branch daughter.
    const d = base();
    d.languages[0].diverged = true; // no died
    d.languages.push({ id: 'b', name: 'B', born: 500, parentId: 'a', relation: 'stage' });
    eq(validateDoc(d).length, 0, 'diverged with a stage successor and no died is valid');
}
{
    const d = base();
    d.languages[0].diverged = true; // no died
    d.languages.push({ id: 'b', name: 'B', born: 300, parentId: 'a', relation: 'branch' });
    eq(validateDoc(d).length, 0, 'diverged with a branch daughter and no died is valid');
}

// --- diverged end year derived from the last successor (no died needed) ----
eq(modelOf([
    { id: 'a', name: 'A', born: 0, diverged: true },
    { id: 'b', name: 'B', born: 500, parentId: 'a', relation: 'stage' },
]).diedOf({ id: 'a', name: 'A', born: 0, diverged: true }), 500,
    'diverged end derives from a stage successor birth when no died');

eq(modelOf([
    { id: 'a', name: 'A', born: 0, diverged: true },
    { id: 'b', name: 'B', born: 300, parentId: 'a', relation: 'branch' },
    { id: 'c', name: 'C', born: 700, parentId: 'a', relation: 'stage' },
]).diedOf({ id: 'a', name: 'A', born: 0, diverged: true }), 700,
    'diverged end is the LAST successor birth across branch + stage');
{
    const d = base(); d.languages[0].region = 42;
    ok(hasErr(validateDoc(d), 'languages[0].region'), 'non-string region is flagged');
}
{
    const d = base(); d.languages[0].populationSeries = { year: 1, count: 2 };
    ok(hasErr(validateDoc(d), 'languages[0].populationSeries'), 'non-array populationSeries is flagged');
}
{
    const d = base(); d.languages[0].populationSeries = [{ year: 'x', count: 5 }];
    ok(hasErr(validateDoc(d), 'languages[0].populationSeries[0].year'), 'non-integer population year is flagged');
}
{
    const d = base(); d.languages[0].populationSeries = [{ year: 1000, count: -3 }];
    ok(hasErr(validateDoc(d), 'languages[0].populationSeries[0].count'), 'negative population count is flagged');
}
{
    const d = base();
    Object.assign(d.languages[0], {
        died: 1500, reconstructed: true, bornCirca: true, diedCirca: true,
        region: 'North', populationSeries: [{ year: 0, count: 10 }, { year: 1500, count: 20 }],
    });
    eq(validateDoc(d).length, 0, 'all new fields set validly → 0 errors');
}

// --- vitalityOf: overall (latest) classification --------------------------

eq(modelOf([{ id: 'x', name: 'X', born: 1000 }]).vitalityOf('x'), null, 'no series → no vitality');

eq(modelOf([{ id: 'x', name: 'X', born: 1000, populationSeries: [{ year: 1000, count: 10 }, { year: 1500, count: 100 }] }])
    .vitalityOf('x').level, 'thriving', 'latest at peak → thriving');

eq(modelOf([{ id: 'x', name: 'X', born: 1000, populationSeries: [{ year: 1000, count: 100 }, { year: 1200, count: 80 }, { year: 1500, count: 60 }] }])
    .vitalityOf('x').level, 'declining', 'falling to 0.6 of peak → declining');

eq(modelOf([{ id: 'x', name: 'X', born: 1000, populationSeries: [{ year: 1000, count: 100 }, { year: 1500, count: 20 }] }])
    .vitalityOf('x').level, 'moribund', 'fallen below half of peak → moribund');

eq(modelOf([{ id: 'x', name: 'X', born: 1000, populationSeries: [{ year: 1000, count: 100 }, { year: 1200, count: 40 }, { year: 1500, count: 60 }] }])
    .vitalityOf('x').level, 'stable', 'recovering (rising below peak) → stable');

eq(modelOf([{ id: 'x', name: 'X', born: 1000, populationSeries: [{ year: 1000, count: 50 }] }])
    .vitalityOf('x').level, 'thriving', 'single point at its own peak → thriving (no crash)');

// dead only for a true extinction (died, no stage successor, not diverged)
eq(modelOf([{ id: 'x', name: 'X', born: 1000, died: 1500, populationSeries: [{ year: 1000, count: 100 }, { year: 1500, count: 100 }] }])
    .vitalityOf('x').level, 'dead', 'extinct language → dead');

ok(modelOf([{ id: 'x', name: 'X', born: 1000, died: 1500, diverged: true, populationSeries: [{ year: 1000, count: 100 }, { year: 1500, count: 100 }] }])
    .vitalityOf('x').level !== 'dead', 'diverged language is not "dead"');

{
    const m = modelOf([
        { id: 'old', name: 'Old', born: 1000, died: 1200, populationSeries: [{ year: 1000, count: 50 }, { year: 1200, count: 50 }] },
        { id: 'mod', name: 'Mod', born: 1200, parentId: 'old', relation: 'stage' },
    ]);
    ok(m.vitalityOf('old').level !== 'dead', 'stage hand-over (died but has a stage successor) is not "dead"');
}

// --- vitalityAt: scrub/play-head classification ---------------------------

{
    const m = modelOf([{ id: 'x', name: 'X', born: 1000, populationSeries: [{ year: 1000, count: 0 }, { year: 1500, count: 100 }] }]);
    eq(m.vitalityAt('x', 900), null, 'before birth → no badge');
    eq(m.vitalityAt('x', 1250).latest.count, 50, 'interpolates population at the scrub year');
    eq(m.vitalityAt('x', 1100).level, 'stable', 'early in a growing series → stable (growing)');
    eq(m.vitalityAt('x', 1500).level, 'thriving', 'grown to its peak → thriving');
}
{
    const m = modelOf([{ id: 'x', name: 'X', born: 1000, died: 1400, populationSeries: [{ year: 1000, count: 100 }, { year: 1400, count: 100 }] }]);
    eq(m.vitalityAt('x', 1500).level, 'dead', 'past the death year of an extinct language → dead');
}

// --- core model structure (regression net for model.js refactors) ---------

{
    const m = modelOf([
        { id: 'p', name: 'Proto', born: -100 },
        { id: 'o', name: 'Old', born: 0, parentId: 'p', relation: 'stage' },
        { id: 'm', name: 'Modern', born: 200, parentId: 'o', relation: 'stage' },
        { id: 'd1', name: 'D1', born: 50, parentId: 'o', relation: 'branch', color: '#123456' },
        { id: 'd2', name: 'D2', born: 60, parentId: 'o', relation: 'branch' },
        { id: 'gd', name: 'GD', born: 120, parentId: 'd1', relation: 'branch' },
    ]);

    eq(m.chainOf(m.byId.get('p')).map(x => x.id).join(','), 'p,o,m', 'chainOf walks the stage chain in order');
    eq(m.roots.map(r => r.id).join(','), 'p', 'the only root is the family head');
    eq((m.branchChildren.get('o') ?? []).map(c => c.id).join(','), 'd1,d2', 'branch children sort by birth year');

    eq(m.colorOf.get('gd'), '#123456', 'an explicit color flows down to a descendant');
    eq(m.colorOf.get('d2'), 'var(--fam-0)', 'a language with no override inherits the family palette slot');

    const lin = m.lineageOf('d1');
    ok(['p', 'o', 'd1', 'gd'].every(id => lin.has(id)), 'lineageOf spans ancestors and descendants');
    ok(!lin.has('d2'), 'lineageOf excludes a sibling branch');

    eq(m.siblingsOf('d1').map(s => s.id).join(','), 'd1,d2', 'siblingsOf matches the layout packing order');
    ok(m.blockersOf('o').length >= 3, 'blockersOf lists the languages that depend on a node');
}

// --- report ---------------------------------------------------------------

console.log(`${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
