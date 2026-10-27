// Offline self-test for the Jev layer (no API key needed).
//   node scripts/jev-selftest.mjs
// 1) builds a real consultation from the corpus and checks size / privacy,
// 2) sends it through the real @typesafe-ai/sdk with a stubbed fetch to verify the wire format,
// 3) runs composeVerdict over canned answers, including safety and conflict cases.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { buildConsultation, composeVerdict } from '../src/lib/jev.ts';
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

console.log('all jev self-tests passed');
