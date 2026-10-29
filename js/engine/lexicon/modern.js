/**
 * Modern vocabulary: words for the things of the last two centuries.
 *
 * DJ, 17 Oct 2026: "modernised" includes "modern vocabulary", words for
 * modern things by 1765, coined or borrowed. Before this a language of 1765
 * had no word for a railway or a telephone at all.
 *
 * Earth's languages got theirs three ways, and each is modelled:
 *
 *   CALQUE, a new compound of native parts translating the idea: German
 *     Eisenbahn "iron road", Fernsehen "far seeing", Chinese 电脑 "electric
 *     brain" for a computer, German Handy-style "hand voice" for a mobile;
 *   EXTENSION, an old word given the new sense: Icelandic sími, "thread",
 *     for telephone; English "car" from the cart; "net" for the internet;
 *   LOAN, from the world language: English "computer" and "internet" in
 *     nearly every language on Earth. Andah's is Lastnu, the constructed
 *     lingua franca (DJ's chart: born about 1700, built from Emaran, Lycroan,
 *     Ukhdari, Ealdorii, Estijan, Arten, Dahen and Alqiran; 2.8 billion
 *     second-language speakers in 1765). Its words are built from those
 *     sources by scripts/build-lastnu.js into data/lastnu.json.
 *
 * Dates are Earth's less 250 years (1765 AFA is 2015 on Earth), so the
 * railway arrives in 1575 and the internet in 1740. A language coins each
 * word once, in the year the thing arrives, if it is spoken then; its later
 * daughters inherit the word and wear it down like any other. How readily a
 * language borrows is its own (drawn once, kept by its daughters' own draws):
 * Icelandic calques nearly everything, Japanese borrows nearly everything.
 *
 * Before Lastnu (1700) every language coined its own words. After it, an
 * open language borrows Lastnu's word for anything new, and may take Lastnu's
 * word for an older thing too, beside its own (German has both Fernsprecher
 * and Telefon).
 */

import { parseWord, wordToIpa } from '../features.js';
import { repairHiatus, syllabify } from '../phonology/phonotactics.js';
import { classOf } from './roots.js';
import { adapt } from '../contact.js';

export const LASTNU_FROM = 1700;

/**
 * gloss, AFA year, calque parts (modifier then head, as most of Earth's
 * calques run), an old word that may take the sense instead, and the Earth
 * precedent.
 */
export const MODERN = [
    { gloss: 'newspaper', year: 1355, calque: ['new', 'word'], analogue: 'German Zeitung, "tidings"; Dutch krant' },
    { gloss: 'factory', year: 1525, calque: ['work', 'house'], analogue: 'German Werkstatt; Finnish tehdas' },
    { gloss: 'democracy', year: 1540, calque: ['people', 'rule'], analogue: 'Greek demokratia, "people-power", calqued into Chinese 民主 "people-master"' },
    { gloss: 'vaccine', year: 1546, calque: ['sickness', 'shield'], analogue: 'Finnish rokote; Chinese 疫苗 "plague shoot"' },
    { gloss: 'parliament', year: 1500, calque: ['law', 'house'], analogue: 'Icelandic Alþingi "all-assembly"; Finnish eduskunta' },
    { gloss: 'steamship', year: 1560, calque: ['fire', 'boat'], analogue: 'German Dampfschiff; Chinese 火轮船 "fire-wheel boat"' },
    { gloss: 'railway', year: 1575, calque: ['iron', 'road'], analogue: 'German Eisenbahn and French chemin de fer, "iron road"' },
    { gloss: 'train', year: 1580, calque: ['fire', 'cart'], extend: 'cart', analogue: 'Chinese 火车 "fire vehicle"; Japanese 汽車' },
    { gloss: 'police', year: 1580, calque: ['law', 'guard'], analogue: 'Finnish poliisi is a loan; Icelandic lögregla "law-keeping"' },
    { gloss: 'telegraph', year: 1587, calque: ['far', 'word'], analogue: 'Greek tele-graphos "far-writer"; Chinese 电报 "electric report"' },
    { gloss: 'photograph', year: 1589, calque: ['sun', 'shadow'], analogue: 'Chinese 照片 "shine picture"; Icelandic ljósmynd "light-image"' },
    { gloss: 'electricity', year: 1600, calque: ['lightning', 'strength'], extend: 'lightning', analogue: 'Chinese 电 "lightning"; Icelandic rafmagn "amber-power"' },
    { gloss: 'football', year: 1613, calque: ['foot', 'play'], analogue: 'German Fußball; Icelandic knattspyrna "ball-kicking"' },
    { gloss: 'bicycle', year: 1615, calque: ['two', 'wheel'], analogue: 'Chinese 自行车 "self-going vehicle"; Finnish polkupyörä "pedal-wheel"' },
    { gloss: 'telephone', year: 1626, calque: ['far', 'voice'], extend: 'thread', analogue: 'German Fernsprecher "far-speaker"; Icelandic sími, the old word for thread' },
    { gloss: 'electric light', year: 1629, calque: ['bright', 'glass'], analogue: 'German Glühbirne "glow-pear"; Chinese 电灯 "electric lamp"' },
    { gloss: 'car', year: 1636, calque: ['self', 'cart'], extend: 'cart', analogue: 'Greek-Latin auto-mobile "self-moving"; English "car" from the old cart' },
    { gloss: 'cinema', year: 1645, calque: ['shadow', 'play'], analogue: 'Chinese 电影 "electric shadow"; Icelandic kvikmynd "living image"' },
    { gloss: 'aeroplane', year: 1653, calque: ['fly', 'boat'], extend: 'bird', analogue: 'Chinese 飞机 "flying machine"; Icelandic flugvél' },
    { gloss: 'radio', year: 1656, calque: ['far', 'hear'], analogue: 'German Rundfunk; Icelandic útvarp "out-throw"' },
    { gloss: 'plastic', year: 1657, calque: ['oil', 'clay'], analogue: 'Chinese 塑料 "moulding material"' },
    { gloss: 'refrigerator', year: 1670, calque: ['cold', 'pot'], analogue: 'Chinese 冰箱 "ice box"; German Kühlschrank "cool cupboard"' },
    { gloss: 'television', year: 1686, calque: ['far', 'see'], analogue: 'German Fernsehen "far-seeing"; Greek-Latin tele-vision' },
    { gloss: 'computer', year: 1696, calque: ['count', 'brain'], analogue: 'Chinese 电脑 "electric brain"; Icelandic tölva from tala "number" and völva "seeress"' },
    { gloss: 'spaceship', year: 1707, calque: ['star', 'boat'], analogue: 'German Raumschiff "space-ship"; Chinese 飞船 "flying boat"' },
    { gloss: 'satellite', year: 1707, calque: ['small', 'moon'], extend: 'moon', analogue: 'Russian sputnik "fellow traveller"; Chinese 卫星 "guard star"' },
    { gloss: 'internet', year: 1740, calque: ['far', 'net'], extend: 'net', analogue: 'English "the net"; Icelandic veraldarvefur "world-web"' },
    { gloss: 'mobile phone', year: 1745, calque: ['hand', 'voice'], analogue: 'German Handy; Chinese 手机 "hand machine"' },
    // the modern world's other things (30 Oct 2026, DJ's plan: deeper languages): 1765 AFA is Earth's 2015, and a language of the
    // FLLA's world needs its team, goal and referee, its president and bank, its email and supermarket. Dates Earth's less 250 years.
    {"gloss": "team", "year": 1613, "calque": ["play", "troop"], "analogue": "Italian squadra; German Mannschaft, \"men-ship\""},
    {"gloss": "goal (sport)", "year": 1613, "calque": ["net", "win"], "extend": "gate", "analogue": "German Tor, the old word for a gate; Italian porta, \"door\""},
    {"gloss": "match (game)", "year": 1613, "calque": ["play", "fight"], "extend": "game", "analogue": "German Spiel and Italian partita: the old words for a game"},
    {"gloss": "player (sport)", "year": 1613, "calque": ["play", "man (male)"], "analogue": "German Spieler; Chinese 球员 \"ball-member\""},
    {"gloss": "referee", "year": 1631, "calque": ["judge", "play"], "extend": "judge", "analogue": "Italian arbitro, the old word for a judge; German Schiedsrichter \"parting-judge\""},
    {"gloss": "league (sport)", "year": 1638, "calque": ["play", "ally"], "analogue": "Italian lega, \"league, alliance\"; German Liga"},
    {"gloss": "stadium", "year": 1646, "calque": ["play", "field"], "analogue": "Greek stadion, a measure of a race; Chinese 体育场 \"sport field\""},
    {"gloss": "coach (sport)", "year": 1650, "calque": ["play", "teacher"], "extend": "teacher", "analogue": "Italian allenatore; German Trainer, a loan"},
    {"gloss": "captain (sport)", "year": 1613, "calque": ["play", "chief"], "extend": "chief", "analogue": "Italian capitano, the army's word; German Kapitän"},
    {"gloss": "fan (supporter)", "year": 1660, "calque": ["play", "friend"], "analogue": "Italian tifoso, \"one with a fever\"; German Anhänger \"one who hangs on\""},
    {"gloss": "trophy", "year": 1640, "calque": ["win", "cup"], "extend": "cup", "analogue": "the cup as the prize: English cup, German Pokal"},
    {"gloss": "champion", "year": 1640, "calque": ["win", "man (male)"], "analogue": "Latin campio, the fighter on the field; Chinese 冠军 \"crowned army\""},
    {"gloss": "world cup", "year": 1680, "calque": ["world", "cup"], "analogue": "French Coupe du Monde; Italian Coppa del Mondo: calqued in every language"},
    {"gloss": "engine", "year": 1520, "calque": ["fire", "work"], "analogue": "German Maschine, a loan; Chinese 发动机 \"start-move machine\""},
    {"gloss": "machine", "year": 1520, "calque": ["iron", "work"], "analogue": "Latin machina from Greek; Finnish kone"},
    {"gloss": "battery", "year": 1550, "calque": ["lightning", "box"], "analogue": "Chinese 电池 \"electric pool\"; German Batterie, a loan"},
    {"gloss": "motor", "year": 1630, "calque": ["move", "iron"], "analogue": "Latin motor \"mover\"; Chinese 马达, a loan"},
    {"gloss": "submarine", "year": 1650, "calque": ["sea", "boat"], "analogue": "German U-Boot \"under-sea boat\"; Chinese 潜艇 \"diving boat\""},
    {"gloss": "rocket", "year": 1676, "calque": ["fire", "arrow"], "extend": "arrow", "analogue": "Italian rocchetta \"little spindle\"; Chinese 火箭 \"fire arrow\""},
    {"gloss": "robot", "year": 1670, "calque": ["iron", "servant"], "extend": "servant", "analogue": "Czech robota \"forced labour\"; Chinese 机器人 \"machine person\""},
    {"gloss": "camera", "year": 1589, "calque": ["picture", "box"], "analogue": "Latin camera \"chamber\"; Chinese 相机 \"picture machine\""},
    {"gloss": "telescope", "year": 1358, "calque": ["far", "see"], "analogue": "Greek tele-skopos \"far-seer\"; German Fernrohr \"far-tube\""},
    {"gloss": "microscope", "year": 1370, "calque": ["small", "see"], "analogue": "Greek mikro-skopos; Chinese 显微镜 \"show-small mirror\""},
    {"gloss": "atom", "year": 1555, "calque": ["small", "thing"], "extend": "seed", "analogue": "Greek atomos \"uncuttable\"; Chinese 原子 \"origin seed\""},
    {"gloss": "science", "year": 1450, "calque": ["knowledge", "work"], "extend": "knowledge", "analogue": "Latin scientia \"knowledge\"; Chinese 科学 \"branch learning\""},
    {"gloss": "university", "year": 1040, "calque": ["knowledge", "house"], "analogue": "Latin universitas \"the whole body\"; Icelandic háskóli \"high school\""},
    {"gloss": "museum", "year": 1500, "calque": ["old", "house"], "analogue": "Greek mouseion \"seat of the Muses\"; Chinese 博物馆 \"wide-things hall\""},
    {"gloss": "library", "year": 1200, "calque": ["book", "house"], "analogue": "German Bibliothek, a loan; Icelandic bókasafn \"book collection\""},
    {"gloss": "bank (money)", "year": 1150, "calque": ["money", "house"], "analogue": "Italian banca \"bench\"; Chinese 银行 \"silver firm\""},
    {"gloss": "company (business)", "year": 1350, "calque": ["trade", "family"], "analogue": "Latin com-panis \"bread-sharers\"; German Gesellschaft \"fellowship\""},
    {"gloss": "factory worker", "year": 1550, "calque": ["work", "man (male)"], "analogue": "German Arbeiter; Chinese 工人 \"work person\""},
    {"gloss": "president", "year": 1539, "calque": ["first", "chief"], "extend": "chief", "analogue": "Latin praesidens \"one who sits before\"; Chinese 总统 \"overall governor\""},
    {"gloss": "election", "year": 1540, "calque": ["choose", "day"], "analogue": "German Wahl \"choice\"; Chinese 选举 \"choose-raise\""},
    {"gloss": "political party", "year": 1430, "calque": ["people", "troop"], "analogue": "Latin pars \"part\"; Chinese 党, an old word for a faction"},
    {"gloss": "republic", "year": 1540, "calque": ["people", "thing"], "analogue": "Latin res publica, \"the people's thing\""},
    {"gloss": "constitution", "year": 1537, "calque": ["law", "book"], "analogue": "German Verfassung; Chinese 宪法 \"constitution law\""},
    {"gloss": "minister", "year": 1450, "calque": ["servant", "king"], "extend": "servant", "analogue": "Latin minister \"servant\": the king's servant became the minister"},
    {"gloss": "embassy", "year": 1450, "calque": ["envoy", "house"], "analogue": "German Botschaft \"message-ship\"; Chinese 大使馆 \"great envoy hall\""},
    {"gloss": "passport", "year": 1650, "calque": ["road", "paper"], "analogue": "French passe-port; Chinese 护照 \"protect-certificate\""},
    {"gloss": "banknote", "year": 1440, "calque": ["paper", "money"], "analogue": "German Geldschein \"money-sheet\"; Chinese 纸币 \"paper money\""},
    {"gloss": "insurance", "year": 1430, "calque": ["shield", "money"], "analogue": "German Versicherung \"making sure\"; Chinese 保险 \"protect-danger\""},
    {"gloss": "magazine", "year": 1490, "calque": ["picture", "book"], "analogue": "Arabic makhazin \"storehouses\"; Chinese 杂志 \"mixed record\""},
    {"gloss": "advertisement", "year": 1600, "calque": ["sell", "word"], "analogue": "German Werbung \"wooing\"; Chinese 广告 \"wide announcement\""},
    {"gloss": "email", "year": 1720, "calque": ["net", "word"], "analogue": "French courriel \"electronic mail\"; Chinese 电邮 \"electric post\""},
    {"gloss": "website", "year": 1740, "calque": ["net", "page"], "analogue": "French site web; Chinese 网站 \"net station\""},
    {"gloss": "video", "year": 1700, "calque": ["move", "picture"], "analogue": "Latin video \"I see\"; Chinese 视频 \"seeing frequency\""},
    {"gloss": "supermarket", "year": 1680, "calque": ["big", "shop"], "analogue": "German Supermarkt; Chinese 超市 \"super market\""},
    {"gloss": "hotel", "year": 1550, "calque": ["guest", "house"], "extend": "inn", "analogue": "French hôtel, the old word for a town house; Chinese 酒店 \"wine shop\""},
    {"gloss": "restaurant", "year": 1520, "calque": ["food", "house"], "analogue": "French restaurant \"restoring\"; Chinese 饭馆 \"rice hall\""},
    {"gloss": "airport", "year": 1670, "calque": ["fly", "port"], "analogue": "German Flughafen \"flight harbour\"; Chinese 机场 \"machine field\""},
    {"gloss": "motorway", "year": 1680, "calque": ["car", "road"], "analogue": "German Autobahn \"car track\"; Chinese 高速公路 \"high-speed road\""},
    {"gloss": "bus", "year": 1580, "calque": ["many", "cart"], "extend": "cart", "analogue": "Latin omnibus \"for all\"; Chinese 公共汽车 \"public steam cart\""},
    {"gloss": "map (atlas)", "year": 1500, "calque": ["world", "picture"], "extend": "map", "analogue": "the map book: Italian atlante; Chinese 地图集 \"earth-picture collection\""},
    {"gloss": "clock", "year": 1350, "calque": ["time", "wheel"], "analogue": "Latin clocca \"bell\"; Chinese 钟 \"bell\""},
    {"gloss": "glasses (spectacles)", "year": 1300, "calque": ["eye", "glass"], "analogue": "German Brille, from beryl; Chinese 眼镜 \"eye mirror\""},
    {"gloss": "vaccination", "year": 1546, "calque": ["sickness", "shield"], "analogue": "Latin vacca \"cow\", from cowpox; Chinese 接种 \"graft seed\""},
    {"gloss": "hospital", "year": 1100, "calque": ["sick", "house"], "analogue": "German Krankenhaus \"sick-house\"; Chinese 医院 \"healing court\""},
    {"gloss": "doctor (physician)", "year": 1100, "calque": ["heal", "man (male)"], "analogue": "German Arzt; Chinese 医生 \"healing scholar\""},
    {"gloss": "tank (vehicle)", "year": 1666, "calque": ["iron", "cart"], "analogue": "English tank, a code word; Chinese 坦克, a loan"},
];

/** Every gloss a modern word is built from: what Lastnu needs roots for. */
export const MODERN_PARTS = [...new Set(MODERN.flatMap((m) => m.calque))];

const word = (byGloss, g) => byGloss.get(g) ?? null;

/**
 * One language's word for one modern thing, or null if it cannot make one.
 *
 * @param m        a MODERN entry
 * @param state    the language when it starts its lifetime (its words)
 * @param node     the language's chart node
 * @param opts     { open: 0-1, how readily it borrows; lastnu: data/lastnu.json; rng }
 */
export function coinModern(m, state, node, { open, lastnu, rng, year = m.year }) {
    const pt = state.phonotactics;
    const byGloss = new Map();
    for (const e of state.entries) if (!e.retired && !e.paradigm && !byGloss.has(e.gloss)) byGloss.set(e.gloss, e);
    if (byGloss.has(m.gloss)) return null;   // already has one (inherited)

    const base = (form, extra) => ({
        form,
        ipa: wordToIpa(form),
        gloss: m.gloss,
        pos: 'n',
        domain: 'modern',
        core: false,
        rank: 260 + Math.round(rng.float(0, 120)),
        zipf: 0,
        class: classOf(form, 'n'),
        syllables: syllabify(form, pt).length,
        irregular: false,
        derivedFrom: null,
        // an addition, as the wider vocabulary is (lexicon/wider.js): no count the engine plans by sees it
        wider: true,
        ...extra,
    });

    // A Lastnu loan, for an open language once Lastnu exists.
    const fromLastnu = lastnu?.words?.[m.gloss];
    if (year >= LASTNU_FROM && fromLastnu && rng.bool(open)) {
        const form = adapt(parseWord(fromLastnu.ipa), state);
        return base(form, {
            id: `modern:${m.gloss}:lastnu`,
            loan: {
                from: 'lastnu', borrowingId: 'modern', kind: 'loan', strength: 1, year,
                label: 'the world language', donorForm: fromLastnu.ipa, adapted: wordToIpa(form) !== fromLastnu.ipa,
            },
            modern: { year, strategy: 'loan', analogue: m.analogue },
            enteredAt: year,
        });
    }

    // An old word taking the new sense, a quarter of the time where one fits.
    const old = m.extend ? word(byGloss, m.extend) : null;
    const [a, b] = m.calque.map((g) => word(byGloss, g));
    if (old && (!a || !b || rng.bool(0.25))) {
        return base(old.form, {
            id: `modern:${m.gloss}:extended`,
            compoundOf: null,
            modern: { year, strategy: 'extension', from: old.id, fromGloss: old.gloss, analogue: m.analogue },
            // the same word, so it has worn as its source has
            enteredAt: node.born,
        });
    }
    if (!a || !b) return null;

    /**
     * The first part keeps at most two syllables: a compound is built of
     * stems, and a language whose words run to four syllables does not say
     * all eight of them (Finnish rauta + tie is rautatie, "railway"). Whole
     * words glued together gave seven-syllable trains.
     */
    const syl = syllabify(a.form, pt);
    const first = syl.length > 2 ? syl.slice(0, 2).flatMap((x) => [...x.onset, ...x.nucleus, ...x.coda]) : a.form;
    const form = repairHiatus([...first, ...b.form], pt);
    return base(form, {
        id: `modern:${m.gloss}:calque`,
        compoundOf: { head: b.id, headGloss: b.gloss, modifier: a.id, modifierGloss: a.gloss, year },
        modern: { year, strategy: 'calque', analogue: m.analogue },
        // Coined from the parts as they then stood: entered at the start of
        // the lifetime it is built in, it wears as its parts wear, so a
        // compound coined in 1575 and a word of 1765 are made of the same
        // stuff. (The year it was coined is `modern.year`; the lifetime's
        // states before then do not have it.)
        enteredAt: node.born,
    });
}

/**
 * The internationalism: an open language living past 1700 may take Lastnu's
 * word for an older thing too, beside its own. Year between 1700 and the end
 * of its lifetime.
 */
export function internationalism(m, state, node, { open, lastnu, rng, end }) {
    const fromLastnu = lastnu?.words?.[m.gloss];
    if (!fromLastnu || m.year >= LASTNU_FROM || end <= LASTNU_FROM) return null;
    // beside a word of its own, and only once
    if (!state.entries.some((e) => e.gloss === m.gloss && !e.retired)) return null;
    if (state.entries.some((e) => e.id === `modern:${m.gloss}:lastnu`)) return null;
    if (!rng.bool(open * 0.5)) return null;
    const year = Math.round(Math.max(LASTNU_FROM, node.born) + rng.float(0, Math.max(1, Math.min(end, 1765) - Math.max(LASTNU_FROM, node.born))));
    const form = adapt(parseWord(fromLastnu.ipa), state);
    return {
        id: `modern:${m.gloss}:lastnu`,
        form,
        ipa: wordToIpa(form),
        gloss: m.gloss,
        pos: 'n',
        domain: 'modern',
        core: false,
        rank: 300 + Math.round(rng.float(0, 120)),
        zipf: 0,
        class: classOf(form, 'n'),
        syllables: syllabify(form, state.phonotactics).length,
        irregular: false,
        derivedFrom: null,
        loan: {
            from: 'lastnu', borrowingId: 'modern', kind: 'loan', strength: 1, year,
            label: 'the world language', donorForm: fromLastnu.ipa, adapted: wordToIpa(form) !== fromLastnu.ipa,
        },
        modern: { year, strategy: 'internationalism', analogue: m.analogue },
        enteredAt: year,
        wider: true,
    };
}
