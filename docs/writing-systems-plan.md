# Writing systems: the plan

DJ, 28 Oct 2026: "can you try and create the writing systems? ... can you
create a plan of how you would do this?"

The short answer is yes. The approach is the same as the languages': not 500
hand-made scripts, but a small number of invented ones that evolve and spread
the way Earth's did, worked out from data the engine already has. Each script
would be a family tree, like the languages, with glyphs that change shape over
time the way letters did between Phoenician and Latin.

## What already exists to build on

- **The canon origins** (wiki, red links so far: named, not written):
  - **Dahen.**
    - Proto-writing at Huxongi (c. 6600 BFA), Qianzo (6000 BFA), Fekhalai
      (5800-5400 BFA) and Bintarha (5th millennium BFA).
    - The Cozo symbols (7th millennium BFA), possibly the first true Dahen
      writing.
    - Then an early "bone script".
    - The Dehlan standardisation of the Dahen script in 207 BFA. This is
      China's story: oracle bones, then the Qin standardisation.
  - **Harappa**, in the Aeses basin of modern Dahe, with proto-writing
    c. 3200 BFA. The Cradle of civilisation page calls it the earliest, which
    clashes with Dahe.wiki's 6600 BFA (a question for you below).
  - **The Alzurian bone script**, grown out of Alzurian proto-writing. Alzuria
    is also where cursive script developed: Mesopotamia's story, cuneiform.
  - **The Quian writing systems**, from c. 1600 BFA.
  - **The Kassah culture's Cres**: no writing, but records kept another way,
    "which might also have had literary uses". This is Earth's quipu.
- **What the engine already gives each language:**
  - its sounds (phonemes);
  - its syllable shapes;
  - its words with their meanings;
  - its word structure (isolating, agglutinative and so on);
  - the year its family was first written (`standardisedAt`; Dahen's is
    207 BFA);
  - spelling frozen at that year and reformed later, and a romanisation.

  A script plugs in where the romanisation is now. The frozen spelling then
  becomes real historical spelling in the native script.
- **The history layer:**
  - the rulers' maps (who ruled whom, and for how long);
  - the contact weights (data/history/contact.json);
  - your religion atlas (from the economy-atlas work).

  On Earth, scripts follow rulers and religions: Latin went with Rome and the
  Church, Arabic with Islam, Cyrillic with Orthodoxy, Brahmi's descendants
  with Hinduism and Buddhism, and Chinese characters to Japan, Korea and
  Vietnam with Chinese learning.

## The pieces

### 1. Which language writes with what, when (the script history)

A script record has five parts:

- an origin (a canon invention, or a parent script);
- a type;
- the languages that use it, and from when;
- its direction;
- its sign inventory.

The rules:

- **Invention is rare.** Earth managed four or five independent inventions
  (Mesopotamia, Egypt, China, Mesoamerica, perhaps the Indus Valley). Andah's
  canon names about as many, so inventions are canon only: Dahen, Harappan,
  Alzurian and Quian, with Cres as a non-script record system.
- **Every other written language borrowed a script.** It takes the script of
  the state that ruled it longest, the faith it took up, or the prestige
  neighbour it traded with. These are scored from the rule contacts and the
  religion map, and DJ's word wins on any of them.
- **When a language starts writing** comes from the engine's
  `standardisedAt` and the first states on the rulers' maps. A language with
  no state stays unwritten, as most of Earth's languages were until recently.
- **Script changes happen**, through conversion, conquest and reform (Turkish
  went from Arabic to Latin script in 1928; Vietnamese from characters to
  Latin).

What comes out is a scripts chart (a tree like the languages'), a scripts
layer on the Through time map, and, for each language, the script it uses in
each year.

### 2. What kind of script, and which signs

- **The type follows the language, then inertia.** Earth's pattern:
  - isolating languages with one-syllable words keep logograms (Chinese);
  - languages with simple CV syllables grow syllabaries (Japanese kana,
    Cherokee, Linear B);
  - Semitic-like languages, where the consonants carry the meaning, write
    consonants only (abjads);
  - complex syllables push towards full alphabets (Greek added vowels to
    Phoenician);
  - Brahmi-type scripts mark vowels on consonants (abugidas).
- **A borrowed script brings its type along**, then bends: Japanese built
  kana out of Chinese characters, Greek turned unneeded Phoenician consonants
  into vowels.
- **The sign inventory is worked out from the language's phonemes** (and its
  CV syllables, or its morphemes for logograms). A borrowing language reuses
  the donor's signs for matching sounds and fills its gaps the ways Earth
  did:
  - diacritics (Czech háček);
  - digraphs (English sh);
  - modified letters (Polish ł, Old English þ and ð);
  - spare letters re-used (Greek vowels).

  romanise.js already does this for the Latin alphabet; the same logic
  generalises to any donor script.
- **Earth's numbers set the sizes:**

  | Type | Signs |
  |---|---|
  | Alphabet | 20-40 |
  | Abjad | 22-28 |
  | Abugida | 30-50 base signs plus vowel marks |
  | Syllabary | 40-90 (kana 46, Cherokee 85) |
  | Logography | thousands, 3,000-5,000 in daily use |

### 3. What the signs look like (the glyphs)

This is the part you doubt. It's also where the history does the work, so
the shapes have reasons rather than being random squiggles.

- **The first signs are pictures of words.**
  - At each canon invention, the engine takes that language's own words for
    things you can draw: sun, water, mountain, eye, hand, ox, house, fish,
    person, tree.
  - It draws each as a simple pictogram from a small set of icon parts
    (circle, dot, wave, peak, line, fork, enclosure).
  - Then it stylises them: fewer strokes, straighter lines, turned to suit
    the writing direction.
- **Letters come from those pictures by first sound** (acrophony, as on
  Earth): the sign that pictured the word for "water" stands for the word's
  first sound. Phoenician mem was "water"; Latin M is still its waves. So
  which letter looks like what follows from that language's own vocabulary
  and sound changes. Two scripts made in different families come out
  different for real reasons.
- **The writing tool and surface shape the strokes:**
  - a stylus on clay gives wedges (cuneiform, the Alzurian cursive);
  - a brush gives thick-thin strokes (Dahen);
  - a chisel on stone gives straight lines and angles (runes, early Greek);
  - a pen on palm leaves gives round forms, since straight lines split the
    leaf (the round scripts of South India and Burma).

  Each script gets a "ductus" (tool, stroke kit, line weight, a baseline or
  a headline like Devanagari's), and the glyphs are drawn with a simulated
  pen, which is what makes them look written rather than drawn by a
  computer.
- **Shapes evolve down the script tree** like sound changes: dated, reasoned
  "glyph changes". They come in a few kinds:
  - turning and mirroring (Phoenician to Greek to Latin);
  - simplifying and cursivising (strokes join, loops appear, as in Egyptian
    hieroglyphs, then hieratic, then demotic);
  - adding a headline or serifs;
  - a reform redrawing everything (the Qin standardisation; for Dahen, the
    Dehlan one in 207 BFA).

  Sister scripts drift apart, so Andah gets families of related scripts
  that look related, as Devanagari, Bengali and Gujarati do.
- **Earth's shape statistics as the check:**
  - letters average about three strokes;
  - Changizi's survey found letter shapes use the same joint types (L, T, X,
    and so on) at the frequencies the eye meets them in nature, across all
    scripts;
  - each script has a narrow stroke-count range;
  - every pair of glyphs must stay easy to tell apart, so near-twins are
    rejected and redrawn.
- **Logograms are built, not drawn one by one.** About 80% of Chinese
  characters are a meaning part plus a sound part. So Dahen gets:
  - a few hundred base signs: the pictograms, simplified;
  - compounds laid out by Earth's templates (left-right, top-bottom,
    enclosed);
  - the sound part chosen from a base sign whose word sounded like this word
    when the compound was made. After later sound changes it no longer
    quite does, just as in Chinese.

### 4. Seeing and typing it

- **A font** (SVG glyphs, then a real font file built in the app with
  opentype.js), so the app can show:
  - dictionary entries;
  - the translator's sentences;
  - place names in the native script beside the romanisation.
- **Direction:** left to right, right to left, or top to bottom (vertical
  needs its own layout). Word separators (dots, spaces, none) are drawn per
  script as on Earth.
- **Numerals:** their own signs, or letters used as numbers (Greek and Hebrew
  did both).
- **Joining scripts** (Arabic-like letters that connect) are the hardest
  typography and come last: first non-joining, then joining with initial,
  middle, final and isolated forms.

### 5. Your controls

- **Lock a glyph or a whole script, like a word.** The engine never redraws
  what you've approved.
- **An editor for glyphs.** You drag strokes, or upload your own drawing and
  have it traced into strokes. Your shapes then evolve down the script tree
  like any other.
- **Pick-one sheets.** For each new script you pick from four candidate
  styles, as the name forge offers names.

## Order of work

1. **Script history: types, origins, spread, dates.** No glyphs yet: a
   scripts chart, a scripts layer on the Through time map, and each
   language's script by year, for you to check against your canon. *Small:
   rules on data that exists.*
2. **Sign inventories and adaptation**: which signs each script has and how
   each language spells with them (the romanisation generalised). *Small to
   medium.*
3. **Glyphs: one invented script end to end.** The Alzurian line, from its
   bone pictograms to a full alphabet or syllabary for a modern descendant,
   with its ductus, acrophony and drift down to Ealdorii, Lycroan and
   Estijan. Shown to you before anything else is built on it. *The real
   test: medium to large.*
4. **The other inventions**, including Dahen's logograms (base signs plus
   compounds) and the Quian and Harappan lines, and every borrowed script
   descended from them. *Large.*
5. **Text everywhere**: font, translator, dictionary, place names; then
   vertical and joining scripts. *Medium.*
6. **Your tools**: locks, editor, tracing your drawings, pick-one sheets.
   *Medium.*

The proof of whether this works is step 3. If the Alzurian glyphs don't look
like a real script to you, the method needs changing before steps 4-6, and
we'll know early.

## DJ's answers (28 Oct 2026)

- **Origins:** all four invented writing (Dahen, Harappan, Alzurian, Quian);
  the Kassah's Cres stays a record system.
- **The Dahen dates are both right, as different things:** the early signs
  (Huxongi 6600 BFA, the Cozo symbols) are proto-writing, and true writing
  starts later, around 3200 BFA.
- **Lastnu** uses the writing system of southern Ayuma. Which script that is
  falls out of step 1's history.
- **No scripts drawn yet:** generate them, starting with the Alzurian line.

## Step 3 built (28 Oct 2026): the Alzurian line

Built and in the app (Views > Languages > Scripts; `npm run scripts` rebuilds
data/scripts.json):

- js/engine/script/strokes.js: glyphs as strokes in a unit box; the pens
  (painted, incised, chisel, stylus wedges, brush, reed pen, palm leaf).
- js/engine/script/pictograms.js: 112 pictures of the lexicon's concepts.
- js/engine/script/adopt.js: invention (a sign per drawable word, then the
  rebus syllable), adoption by acrophony (the borrower's own word's first
  sound), the kind by the borrower's sounds (abugida, abjad, alphabet),
  spare signs to vowels (Greek), new letters from the nearest with a mark.
- js/engine/script/evolve.js: straighten, simplify, cursivise, rotate,
  mirror, standardise, drift, and marks to tell twins apart.
- js/engine/script/write.js: a word written in a stage (word-signs,
  syllables, consonants only, consonant + vowel mark, or letters).
- scripts/build-scripts.js: the line as 24 stages (dates placeholders):
  Alzurian proto-writing 2800 BFA (Azatin) > bone script 2400 > cursive
  1700 (Proto-Ukhdari, turned a quarter, rtl) > Classical reform 600 BFA
  (abjad, chisel) > the Ealdorii and Ukhdari lines to 1765; the Saetnde
  adoption 500 BFA (abugida, ltr, mirrored) > Lycroan, Emaran, Verusan
  (Lastnu writes with the Emaran form: my pick); Kaalsite from the bone
  script 900 BFA (alphabet, columns); Easuhuran from the classical 100 BFA.

DJ (28 Oct): "I am stunned. This looks incredible." His one fix: the 1765
forms still looked written, where "now they would have been typed", and
simplified. So each line now ends in print: a roman face with serifs at the
standard language's year (as Jenson's roman of 1470 regularised the
humanist hand), then the modern sans-serif face of 1700, every stroke to
the line and the commonest signs cut to their fewest strokes (the
grotesque faces of the 1800s; the simplified Chinese characters of 1956).
And each branch has a house style of its own, inherited with a little new
at every branch (width, lean, round or angular, hung from a headline), the
way Devanagari, Bengali and Gujarati differ.

Open for DJ: the dates and the line; which borrowers took what; whether
Lastnu's is the Emaran or the Lycroan form; whether sister scripts should
differ more than they do; every shape (nothing locked yet).

## Honest limits

- **Generated glyphs can look arbitrary.** The guards are the
  pictogram-to-letter history, the pen model, Earth's shape statistics and
  your pick-one sheets. Even so, the first attempt will need your eye and
  probably a few rounds.
- **Thousands of good-looking logograms is hard** even with composition
  rules, and for Dahen it's where the most iterations will go.
- **Joining (cursive) scripts and vertical text are real typography work.**
  They come after the rest works.

## Flags (28 Oct 2026)

DJ: seven flags carry script, "hint that the language that they use fits with their flag"; only his seven (Arbiya, Etirha, Gaeiya, Raledria, Dahe, Sanagara and one not yet named), never other flags. `scripts/trace-glyph.py` traces an emblem into strokes (data/canon/flag-glyphs). `FLAGS` in build-scripts.js reads each emblem as the first letter(s) of the country's name in the script of its official language (my pick, DJ: "you pick per flag") and fixes those letters to the flag's shapes:

- Arbiya (Lycroan): the a. The Lycroan face now hangs every letter from a top bar, as the emblem does.
- Etirha (Lastnu, written in Emaran): the e. Gaeiya (Emaran): x (its g) and a. Raledria (Emaran): the r. The Emaran face is now square (square Kufic): curves broken into corners and diagonals into elbows, like the three emblems.
- Dahe and Sanagara (Dahen, Sanagaran): traced; they wait for the Dahen script.
- Later the same day: Lycroan is the round hand (the hook of Arbiya's A), Emaran the square one standing alone, never hung from a line (its three flags). Sister branches now take, of eight draws, the hand least like their sisters' (Ealdorii hung and narrow, Ukhdari free of the line). The marks that tell twins apart are tagged and survive print, and look-alikes are judged with a cell of slack (similarity in strokes.js).

## Step 4: the Dahen line (28 Oct 2026)

DJ: Dahen stays word-signs "like Chinese"; Sanagara shares Dahe's script; flag meanings left for later. js/engine/script/logo.js builds word-sign stages the way Chinese grew: a picture where a word can be drawn; a borrowed sign for grammar words, pronouns and counting words (其, 我); and for the rest a compound of the domain's radical (RADICAL: water, hand, heart, mouth, cowrie for trade, and so on) beside a sign of a word that sounds alike. Compounds are kept as parts and put together again at every stage, so a radical changes alike everywhere; the sounds change under the signs. DAHEN in build-scripts.js: proto-writing 6600 BFA (Jiahu), bone script 3200 BFA, bronze, the Dehlan seal reform 207 BFA (Qin small seal), clerical (rings and arcs squared, short radical forms), regular, print in a Song face, simplified (1956: sound parts swapped for simpler sound-alikes, set left to right); Sanagara from 800 AFA reads the signs with its own words (Japanese kun readings), coins its own signs, and keeps the full forms.
- Rework after DJ (28 Oct 2026: too few words, compounds full of specks that "don't correlate", not at the level of Chinese, Japanese or Korean): every stage now changes the hand as China's did (standing beasts, cast, seal, the clerical break into six strokes, regular hooks, cursive-born simplification); regularise() clears specks, spaces parallel strokes evenly, joins ends to the strokes they near, and fills the square; sound parts may themselves be compounds (three columns at most) and a sound part that already heads a family is preferred, so families recur (青 清 請 情); radicals stand left, over, under or round (心 貝 below, 門 around); derived words are written as their root's sign and an affix's (作者), so the whole lexicon can be written. About 700 signs by 1700, ten strokes a sign in the regular script (Chinese about twelve), seven and a half simplified. scripts.json keeps word-signs as short stroke strings, drawn on first use (hydrate in strokes.js).
- The same ways for the Alzurian line (29 Oct 2026, DJ): the stone-cut stages (the classical reform, the Saetnde and Kaalsite borrowings) rebuild every letter on one grid of points from bars, bowls and rings (lattice in evolve.js: the Greek and Roman capitals, the runes), so each alphabet reads as one set; print tidies specks and lines that run back on themselves (tidy); twins are told apart once more at the end of each stage. DJ: the flags can be changed to fit the letters, not the other way round.

## More lines (29 Oct 2026)

DJ: Harappa is the city where the Dahen writing systems were first developed; the Quian writing systems are the Ankusano peoples', looking like Thai and the other scripts of South-East Asia; Cres to wait; Passonin's script looks like Arabic, Casan's like Georgian or Armenian; Ashonic, Proto-Mahen and Osnealan (Arabic again) have scripts of their own.

- QUIAN: Proto-Ankusano-Elaian pictures in rounded blocks (1600 BFA, each invention draws its own way), signs read for sounds, a reform to an abugida out of the blocks (700 BFA, Brahmi), then the palm-leaf sisters: Sakernlesi (Thai bodies with loop heads), Mikrolean (Burmese circles), Kiiaavo (Khmer, hung from a line), and Ashonic's own staves in columns (Batak, Ogham).
- OWN: Passonin and Osnealan from the classical Alzurian letters, worn onto shared skeletons and dotted (rasmScript in hands.js: Arabic out of Aramaic; Osnealan squatter, as Syriac), joined on the line; Casan made by one scholar from the southern Saetnde letters (archScript: Armenian 405, Georgian); Proto-Mahen pressed in clay wedges (Ugaritic; the look is my pick) down to Veruni.
- Text writing (29 Oct 2026, DJ: "the text writing after"): js/engine/script/use.js finds the script a language wrote in a year (its own latest stage, else its nearest ancestor's) and writes translated words in it. The translator shows every translation in its script, saying when the script is an ancestor's; the Scripts page's Write tab takes an English sentence. Joined scripts run along one baseline; word-signs write the word's sign.
- Cleaning the faces people read (29 Oct 2026, DJ: letters that looked like "two different objects put next to each other", clipped or at odd angles): `finish` in evolve.js is the type designer's pass on every print and modern face (and the word-signs' simple parts): hairpins cut into separate strokes and flicks dropped, angles within 12 degrees set true, ends that nearly meet welded, gaps closed along a stroke's own line and overshoots trimmed, doubled strokes dropped, closed curves drawn as clean ovals (flat ones as bars), the dots regular, at most four strokes to a letter. In strokes.js every ribbon is wound the same way (opposite windings had cancelled at crossings, leaving holes and hairlines), corners are mitred to a right angle and bevelled beyond, a ribbon never folds over itself, repeated points are dropped, closed curves run smoothly through their closing point, and the sans-serif, cast, leaf and painted inks have round ends.

## Step 5: the script history (29 Oct 2026)

DJ's canon: Estijan writes the Alzurian abjad as Kelhari's script (an Estijan hand, est-* stages); a fifth invention for Ancient Areoix Lie, the Tzinalli world's glyphs in the Mesoamerican manner (are-* stages, blocks kept to 1765); the religions carry scripts (Kallimethra many with Emaran as default, Kelhari the Alzurian abjad, Imarel the Quian letters by nearest sister, Srivandha Sakernlesi, Passanu Passonin, Thessovai Osnealan and Casan, Tzinalli Arten), arising Tzinalli 3000 BFA, Kallimethra 1000 BFA, Imarel 400 BFA, Thessovai 300 BFA, Kelhari 200 BFA, Srivandha 500 AFA, Passanu 500 AFA. scripts/build-script-history.js writes data/history/script-history.json: per language, dated events by own stage, rule (contact superstrates), religion, co-official state, family (following the line's reforms, as strong as the mother's reason less one) and neighbour; replacements are proposed switches for DJ's veto (docs/script-history-proposals.md, data/history/script-vetoes.json). A stage's `line` (where a script was taken up) tells scripts apart; use.js stageInForce finds the stage in force along a line by the language's own ancestry. The translator says since when and by what road a language writes its script. Nine living languages stay unwritten.
- Areoix Lie's script redone on Egypt's road (29 Oct 2026, DJ disliked the Maya-like blocks in columns): js/engine/script/hiero.js reads a stage of pictures three ways, as Egyptian did: each picture its own word (with a stroke beneath), the first consonant of its word (13 consonant signs for Arten), and a kind of thing set unspoken at a word's end (21 determinatives, the radicals of logo.js); vowels unwritten. Stages: proto-writing 900 BFA, hieroglyphs carved in relief 500 BFA, hieratic 100 AFA, demotic 900 AFA, print 1500, the modern face 1700, all in rows right to left.

## Step 6: the script map (30 Oct 2026)

The history map (Views, Through time) has a colour "by script (what people write)": each language in the script it wrote in the year shown, from the script history; kindred scripts share a hue band (the Alzurian scripts warm, the Quian green, the Dahen blue, the Arten violet), the legend names each script by its modern faces ("Ealdorii / Ukhdari script") with the stages in force that year, the stream chart shows each script's share of the land through history, and hovering a land says since when and by what road its people write. Scripts are lines: an invention or another people's taking-up begins one, a reform stays on it (the classical Alzurian letters are the same script as the bone pictures; Verusan a face of the Saetnde script), so the map tells fourteen scripts apart. A link opens the app on a view: #views/history?mode=map&colour=script&i=656 (main.js openFromHash). The history carries its own index of the stages and the lines, so the map loads no glyphs.

## Step 7: the fonts, and the history reworked (30 Oct 2026)

Fonts: scripts/build-fonts.js (npm run fonts) writes one OpenType font per modern face to data/fonts/ (opentype.js; each sign's inked rings united into one outline with polygon-clipping, since a font may not have overlapping contours), 22 fonts, with index.json listing each sign's code point (Private Use Area from U+E000 in the script's order), the keys that type it (a Latin letter where the sound is one, the IPA letter where it is one, capitals for a two-case script), its value and kind. A joining script's letters carry the stroke along the line; an abjad's typed vowels are blanks. The Scripts page has a Type tab: text set in the face's font, the keys, the signs to click in, a download link. The gate (test-scripts.js) parses every font and checks every sign has an outline.

The history reworked on DJ's points (30 Oct 2026: Emaran had reached Massir only in the model, "the future predicting the past"; Kaastini should write Dahen's script or its own; Estijan's former lands the Estijan script; Hadan the Lycroan; Acranan and Zenashan scripts linked to Ealdorii; colonised natives their colonisers' script; more unique scripts): rules now come from the yearly maps' full superstrate table (80 years over a quarter of the land, the greater of two rulers at once); colonies (areas role "colonial") give the natives the coloniser's script; a faith carries a script only where a ruler, a neighbour (by land, over a narrow sea, or along a trade lane) or a fellow official language already writes one of the faith's (Kallimethra: any), the earliest carrier first; a people's own script, or its mother's own, is never unseated by rulers or faith; a kindred script (one taken up from the other) unseats nothing; a script spreads only once it is writing; later events of a mother bind her daughters only when they are her own reforms; three passes, so rulers younger than their subjects count. New lines: Acranan (acr, from Old Ealdorii, 300), Zenashan (zen, from Middle Ealdorii, 950), Kaastini (kas, the Dahen signs read with Kaastini words, 1050); Hadan a user of the Lycroan script from 800. In 1765: 8 living languages unwritten (proto nodes and three small ones), 28 switches proposed.

## Step 8: joined letters (30 Oct 2026)

- **Positional forms** (`js/engine/script/joining.js`): every letter of a joined script has isolated, initial, medial and final forms. Passonin and Osnealan join on their baseline, as Arabic does. Medial letters are narrowed and their tails tucked up. Final letters keep their tails. Rasm alif, dal, ra and waw join only to the letter before, so a word breaks after them. Dorimian hangs its letters on a spine, with a crown to start a word and a tail to end it, as Mongolian does.
- **Drawn in the app** by `write.js wordSvg`, each letter in its form by its place in the word (`formsOfWord`).
- **In the fonts** (`scripts/build-fonts.js`): the initial, medial and final forms each have a code point of their own after the signs, as Unicode's Arabic presentation forms do. They are also the OpenType `init`, `medi` and `fina` substitutions. The Scripts page's Type tab picks the forms as you type. Dorimian's font keeps plain letters on a spine, because browsers set private-use letters sideways in vertical text. The app draws its joined forms.
- **The wider vocabulary's word-signs** come after the older words' in every pass of `logo.js`, and older compounds are built only from older signs. The 3,379 new signs redrew none of the 11,009 older ones.
- **The views build no longer rewrites** `data/history/contact-typology.json` unless asked (`--settle`). Rewriting it re-rolled 96% of every language's words.

## Step 9: your tools (30 Oct 2026)

The plan's last step: an editor for glyphs, tracing your drawings, and pick-one sheets. The locks came first (`npm run scripts:lock`). Both tools live in the Scripts window.

- **Draw** (`js/views/glyph-editor.js`): one sign at a time, as the strokes the engine keeps, with the stage's own pen inked behind them, so what you draw is what the script looks like. Draw point by point or freehand, drag points or whole strokes, add and take out points, make a stroke a curve, closed, or a telling mark (a dot that survives print). The dashed lines show where most of the script's letters stand. It warns when the sign is too like another to read apart. Start from the sign as it is, from the sign it came from in the parent script, or from nothing. Double-click a sign in the Signs tab, or use "Draw this sign" in "One sign through time". Points stay on the canvas however far a drag runs.
- **Tracing a drawing** (`js/engine/script/trace.js`): a scan, photo or Paint.NET export, drawn dark on light. The ink is thinned to its centre lines (Zhang and Suen), followed from end to end and fork to fork, runs that go straight through a fork are joined into one stroke, each run is cut to its corners (Douglas and Peucker), smooth bends are kept as curves, and a small blot is a dot.
- **Hands** (`js/views/script-hands.js`): the pick-one sheet. The stage's hand beside three more, drawn as the engine draws a branch's own hand from its parent's (`evolve.js houseStyle`), on the same signs; "Draw three more" for another three. A hand changes width, lean, roundness and the headline, never a letter's place on the line (`own.js restyle`). Printed faces stay upright. Word-sign scripts have no hand to pick.
- **Where it is kept**: `data/scripts-own.json`, by what each sign writes (the lock's key, `own.js lockKey`). Your drawing wins over the engine and over the lock, which only freezes what the engine drew; `lock-scripts.js` never locks your drawing as the engine's. "Back to the engine's shape" drops it and the locked shape returns.
- **Carrying it down**: your shape goes into its stage as the stage is built, so the stages after it grow from it. A drawing saved with "carry it down" releases the lock on the signs that came from it (`own.js descendantsOf`), so the engine redraws them from your shape, and locks them again. A hand carried down moves every later script's hand by the same step. Without it, the later scripts keep their locked shapes.
- **Saving** (`POST /api/scripts/own` in `server.js`) writes the file and keeps the old one in `backups/`. A drawing or a hand needs no language worked out, so `scripts/patch-own.js` writes it straight into `data/scripts.json` as the build would, and the fonts are rebuilt: seconds. Only carrying a drawing down, or handing back a sign the lock has no shape for, runs the whole scripts build (many minutes) and relocks. One save at a time. The gate (`npm run test:scripts`) checks the tracer, the keys and that every sign in the file is drawn as you drew it.
- **Vowel marks and numerals** are drawn the same way: double-click one in the Signs tab, or pick it from the editor's list. A mark is drawn over one of the script's consonants, shown faint, so it sits where it will be written; it is told from the other marks, a numeral from the other numerals. Both are kept in `data/scripts-own.json` (`marks` by vowel, `numerals` by value) and win over the lock. A numeral that took a letter's shape (5, 10, 100, 1000) keeps its own locked shape when the letter is redrawn: draw the numeral too. A picked hand restyles neither.
- **Switches** (`js/views/script-switches.js`): the script history's proposed switches as a list to veto, each with a few signs of the script it leaves and the one it takes up, and why (a ruler, a coloniser, a faith and who brought it, a neighbour, its mother). Filter by language or reason, living languages first. Apply saves `data/history/script-vetoes.json` and rebuilds the history and its sheet (`PUT /api/scripts/vetoes`, about a second); struck switches are listed with "let it happen". A struck switch can let a later one through, so the list is read again after each apply.
- **The religion map travels with the data**: `build-script-history.js` finds andah-atlas by `ANDAH_ATLAS`, `Documents/andah-atlas` or its old path, and keeps each state's people by faith in `data/canon/religion-map.json`. A copy without the atlas builds from that; with neither, it refuses (exit 2) rather than write a history with no faith's scripts in it (on the laptop, 30 Oct 2026, it would have dropped 5 switches and left 5 more languages unwritten). The vetoes are saved either way. **The copy is made on the first build where the atlas is: run `npm run scripts:history` there and commit `data/canon/religion-map.json`.**
- **Every window follows a save**: the dictionary, the name forge, the translator and the language panels (and the panel's worker) forget the scripts on the save's event (`use.js SCRIPTS_CHANGED`) and read them again.
