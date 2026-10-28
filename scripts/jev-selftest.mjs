// Offline self-test for the Jev layer (no API key needed).
//   node scripts/jev-selftest.mjs
// 1) builds a real consultation from the corpus and checks size / privacy,
// 2) sends it through the real @typesafe-ai/sdk with a stubbed fetch to verify the wire format,
// 3) runs composeVerdict over canned answers, including safety and conflict cases.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { buildConsultation, composeVerdict, bearsFrom } from '../src/lib/jev.ts';
import { retrieve, LIBRARY_SOURCES } from '../src/lib/library.ts';
import { combineLegs, bitsToLeg } from '../src/lib/opele.ts';

const corpus = JSON.parse(readFileSync(new URL('../data/odus.json', import.meta.url), 'utf8'));
const th = (a, b) => combineLegs(bitsToLeg(a), bitsToLeg(b));
const main = th(14, 3); // Ogunda–Owonrin
const supports = [th(15, 15), th(0, 5)];
const records = [main, ...supports].map((t) => ({ throw: t, record: corpus.find((o) => o.id === t.id) }));
const QUESTION = 'Should I accept the new job offer in another city?';

/* 1 — request shape */
const req = buildConsultation(main, supports, records, QUESTION);
const json = JSON.stringify(req);
console.log(`state ≈ ${json.length} chars, questions: ${Object.keys(req.questions).join(', ')}`);
assert.ok(json.length < 20000, 'state should stay small');
assert.ok(!/seeker_name|seekerName/i.test(json), 'seeker name must not be sent');
assert.ok(req.questions.supports_effect, 'supports question present when supports exist');
assert.ok(!buildConsultation(main, [], records, QUESTION).questions.supports_effect, 'no supports question without supports');
for (const [n, q] of Object.entries(req.questions)) {
  if (q.type === 'choice') assert.ok(Object.keys(q.criteria).length >= 2, `${n} choice criteria`);
  if (q.type === 'score') assert.ok(q.criteria.length >= 2, `${n} score levels`);
}

/* 2 — wire format through the real SDK */
let sent;
const canned = {
  model: 'jev-test',
  answers: Object.fromEntries(
    Object.entries(req.questions).map(([n, q]) => [
      n,
      q.type === 'noul'
        ? { type: 'noul', noul: 0.8 }
        : q.type === 'score'
          ? { type: 'score', score: 1.4, confidence: 0.7, legend: {}, probabilities: {} }
          : { type: 'choice', choice: Object.keys(q.criteria)[0], confidence: 0.9, probabilities: { [Object.keys(q.criteria)[0]]: 0.9 } },
    ])
  ),
  usage: { input_tokens: 1, output_tokens: 1 },
};
const client = new TypeSafeClient({
  apiKey: 'test',
  compression: false,
  fetch: async (url, init) => {
    sent = { url: String(url), body: JSON.parse(init.body) };
    return new Response(JSON.stringify(canned), { status: 200, headers: { 'content-type': 'application/json' } });
  },
});
const res = await client.systemOne({ state: req.state, questions: req.questions });
assert.equal(sent.body.state.seeker_question, QUESTION);
assert.equal(sent.body.questions.tone.type, 'choice');
assert.equal(sent.body.questions.caution.type, 'score');
assert.equal(sent.body.questions.is_yes_no.type, 'noul');
assert.equal(res.answers.tone.choice, 'ire');
console.log(`sdk → ${sent.url}  ok`);

/* 3 — verdict logic */
const choice = (c, conf = 0.9, probs) => ({ type: 'choice', choice: c, confidence: conf, probabilities: probs ?? { [c]: conf } });
const noul = (v) => ({ type: 'noul', noul: v });
const score = (s, conf = 0.8) => ({ type: 'score', score: s, confidence: conf });
const base = () => ({
  topic: choice('money_work'),
  sensitive: choice('none', 0.97, { none: 0.97, self_harm: 0.01 }),
  is_yes_no: noul(0.95),
  tone: choice('ire'),
  favorable: noul(0.9),
  caution: score(0.3),
  advice: choice('act_now'),
  offering_mentioned: noul(0.2),
});

let v = composeVerdict(base());
assert.equal(v.kind, 'answer'); assert.equal(v.yesNo, 'yes'); assert.match(v.headline, /^Ire/);

v = composeVerdict({ ...base(), tone: choice('osogbo'), favorable: noul(0.1), caution: score(2.8) });
assert.equal(v.yesNo, 'no'); assert.match(v.headline, /^Osogbo/); assert.equal(v.cautionLabel, 'A serious warning');

v = composeVerdict({ ...base(), tone: choice('osogbo'), favorable: noul(0.85) });
assert.equal(v.yesNo, 'conditional'); assert.ok(v.flags.includes('conflict:osogbo-vs-favorable'));

v = composeVerdict({ ...base(), is_yes_no: noul(0.1) });
assert.equal(v.yesNo, null, 'open question gets no yes/no');

v = composeVerdict({ ...base(), tone: choice('ire', 0.4) });
assert.equal(v.kind, 'unclear', 'low tone confidence → unclear');

v = composeVerdict({ ...base(), tone: choice('text_silent') });
assert.equal(v.kind, 'unclear');

// safety is asymmetric: 30% self-harm probability redirects even though "none" still wins
v = composeVerdict({ ...base(), sensitive: choice('none', 0.6, { none: 0.65, self_harm: 0.3, medical: 0.05 }) });
assert.equal(v.kind, 'redirect'); assert.match(v.lines[0], /988/);

v = composeVerdict({ ...base(), sensitive: choice('medical', 0.8, { medical: 0.8, none: 0.2 }) });
assert.equal(v.kind, 'redirect'); assert.equal(v.yesNo, null);

v = composeVerdict({ ...base(), offering_mentioned: noul(0.9), supports_effect: choice('soften') });
assert.ok(v.lines.some((l) => /ebó/.test(l)) && v.lines.some((l) => /soften/.test(l)));

v = composeVerdict({}); // service returned nothing usable
assert.equal(v.kind, 'unclear');

/* 4 — old-books library: retrieval by how the cast landed */
const ids = (hits) => hits.map((h) => h.passage.id);
const lib = JSON.parse(readFileSync(new URL('../data/library/public-domain.json', import.meta.url), 'utf8'));
for (const p of lib.passages) {
  assert.ok(LIBRARY_SOURCES.some((s) => s.id === p.source), `${p.id}: unknown source`);
  assert.ok(p.text.trim().length > 20 && !/Odii|Ejl\b|Ogbfe|\^/.test(p.text), `${p.id}: OCR artifacts left in text`);
}

let r = retrieve(th(15, 15), []); // Ejiogbe Meji
assert.deepEqual(ids(r.cast).sort(), ['ejiogbe-principal', 'ejiogbe-verse', 'meji-dennett']);
assert.equal(r.conventionNote, null, 'no naming-order note for a Meji');
assert.match(r.cast[0].why, /both legs/);

r = retrieve(th(14, 3), []); // Ogunda–Owonrin: mixed pair, no Ejiogbe
assert.deepEqual(ids(r.cast), ['combination-dennett']);
assert.match(r.conventionNote, /Ogunda–Owonrin/); assert.match(r.conventionNote, /Owonrin–Ogunda/);

r = retrieve(th(3, 15), []); // Ejiogbe on the LEFT leg
assert.ok(ids(r.cast).includes('ejiogbe-principal') && /left leg/.test(r.cast.find((h) => h.passage.id === 'ejiogbe-principal').why));
r = retrieve(th(15, 14), []); // Ejiogbe on the RIGHT leg
assert.match(r.cast.find((h) => h.passage.id === 'ejiogbe-principal').why, /right \(primary\) leg/);

r = retrieve(th(14, 3), [th(15, 15)]); // Ejiogbe only among the supports
assert.match(r.cast.find((h) => h.passage.id === 'ejiogbe-verse').why, /support 1/);

r = retrieve(th(14, 3), []);
const stories = r.method.filter((h) => h.passage.point === 'stories');
assert.equal(stories.length, 2); assert.ok(stories.every((h) => h.agreeing.length === 1), 'two sources agree on the stories');
assert.equal(r.method.filter((h) => h.passage.point === 'opele').length, 2);
// agreement must mean the same point: a verse and a remark about Ejiogbe are not "agreeing"
r = retrieve(th(15, 15), []);
assert.ok(r.cast.every((h) => h.agreeing.length === 0), 'no false agreement among Ejiogbe passages');

// Jev gets one relevance question per flagged passage, and the answers parse back by passage id
const req2 = buildConsultation(main, [], records, 'Why am I always ill?');
assert.ok(req2.questions['bears:medicine-dennett'] && req2.state.library['medicine-dennett']);
assert.ok(!req2.questions['bears:ejiogbe-verse'], 'verse only asked when Ejiogbe is in the cast');
const req3 = buildConsultation(th(15, 15), [], records, 'Will I gain authority?');
assert.ok(req3.questions['bears:ejiogbe-verse']);
assert.deepEqual(bearsFrom({ 'bears:medicine-dennett': { type: 'noul', noul: 0.8 }, tone: { type: 'choice', choice: 'ire', confidence: 1, probabilities: {} } }), { 'medicine-dennett': 0.8 });

console.log('all jev self-tests passed');
