/**
 * Cambridge Dictionary / English Profile (CEFR) に基づく語彙レベル
 * 回答欄の単語を見てテンプレートのレベルを決める際に使用する。
 * 未収録語は B2 とする（控えめに上級として扱う）。
 */

const CEFR_ORDER = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };

/** 語（小文字）→ CEFR。Cambridge / English Profile の目安に合わせた割り当て */
const WORD_CEFR = {
  // A1
  be: 'A1', is: 'A1', are: 'A1', was: 'A1', were: 'A1', been: 'A1', being: 'A1',
  have: 'A1', has: 'A1', had: 'A1', do: 'A1', does: 'A1', did: 'A1',
  go: 'A1', goes: 'A1', going: 'A1', gone: 'A1', get: 'A1', gets: 'A1', getting: 'A1', got: 'A1',
  make: 'A1', makes: 'A1', making: 'A1', made: 'A1',
  take: 'A1', takes: 'A1', taking: 'A1', taken: 'A1',
  want: 'A1', wants: 'A1', wanting: 'A1', wanted: 'A1',
  need: 'A1', needs: 'A1', needing: 'A1', needed: 'A1',
  give: 'A1', gives: 'A1', giving: 'A1', gave: 'A1', given: 'A1',
  know: 'A1', think: 'A1', see: 'A1', come: 'A1', can: 'A1', will: 'A1',
  the: 'A1', a: 'A1', an: 'A1', to: 'A1', in: 'A1', on: 'A1', at: 'A1', for: 'A1', by: 'A1',
  it: 'A1', we: 'A1', they: 'A1', you: 'A1', he: 'A1', she: 'A1', i: 'A1',
  // A2
  near: 'A2', nearly: 'A2', nearer: 'A2', nearest: 'A2',
  on: 'A2', at: 'A2', in: 'A2', by: 'A2', for: 'A2',
  under: 'A2', underneath: 'A2', below: 'A2', beneath: 'A2',
  behind: 'A2', back: 'A2', after: 'A2', rear: 'A2',
  between: 'A2', among: 'A2', middle: 'A2', center: 'A2',
  from: 'A2', to: 'A2', towards: 'A2', into: 'A2',
  fill: 'A2', full: 'A2', filled: 'A2', filling: 'A2',
  write: 'A2', writes: 'A2', writing: 'A2', written: 'A2',
  open: 'A2', opens: 'A2', opening: 'A2', opened: 'A2',
  close: 'A2', closes: 'A2', closing: 'A2', closed: 'A2',
  more: 'A2', most: 'A2', much: 'A2', many: 'A2', few: 'A2', lot: 'A2',
  meet: 'A2', meets: 'A2', meeting: 'A2', met: 'A2',
  new: 'A2', newer: 'A2', newest: 'A2', newly: 'A2',
  right: 'A2', rightly: 'A2', rightness: 'A2', rightful: 'A2',
  same: 'A2', similar: 'A2', equal: 'A2', alike: 'A2',
  far: 'A2', farther: 'A2', farthest: 'A2', farness: 'A2',
  wait: 'A2', waits: 'A2', waiting: 'A2', waited: 'A2',
  try: 'A2', tries: 'A2', trying: 'A2', tried: 'A2',
  check: 'A2', checks: 'A2', checking: 'A2', checked: 'A2',
  enter: 'A2', enters: 'A2', entering: 'A2', entered: 'A2',
  order: 'A2', ordering: 'A2', ordered: 'A2', orders: 'A2',
  bring: 'A2', brings: 'A2', bringing: 'A2', brought: 'A2',
  send: 'A2', sends: 'A2', sending: 'A2', sent: 'A2',
  // B1
  complete: 'B1', completing: 'B1', completed: 'B1', completes: 'B1',
  forward: 'B1', forwarded: 'B1', forwarding: 'B1', forwards: 'B1',
  available: 'B1', availability: 'B1', avail: 'B1', availably: 'B1',
  receive: 'B1', receives: 'B1', receiving: 'B1', received: 'B1',
  submit: 'B1', submits: 'B1', submitting: 'B1', submitted: 'B1',
  cancel: 'B1', cancelled: 'B1', cancelling: 'B1', cancels: 'B1',
  require: 'B1', required: 'B1', requiring: 'B1', requires: 'B1',
  hold: 'B1', held: 'B1', holding: 'B1', holds: 'B1',
  improve: 'B1', improvement: 'B1', improving: 'B1', improved: 'B1',
  register: 'B1', registration: 'B1', registered: 'B1', registering: 'B1',
  distribute: 'B1', distributed: 'B1', distributes: 'B1', distributing: 'B1',
  schedule: 'B1', scheduled: 'B1', scheduling: 'B1', schedules: 'B1',
  present: 'B1', presented: 'B1', presents: 'B1', presenting: 'B1',
  announce: 'B1', announced: 'B1', announces: 'B1', announcing: 'B1',
  finalize: 'B1', finalized: 'B1', finalizes: 'B1', finalizing: 'B1',
  review: 'B1', reviews: 'B1', reviewing: 'B1', reviewed: 'B1',
  resolve: 'B1', resolved: 'B1', resolves: 'B1', resolving: 'B1',
  approve: 'B1', approves: 'B1', approved: 'B1', approving: 'B1',
  return: 'B1', returns: 'B1', returned: 'B1', returning: 'B1',
  cover: 'B1', covers: 'B1', covering: 'B1', covered: 'B1',
  extend: 'B1', extended: 'B1', extending: 'B1', extends: 'B1',
  welcome: 'B1', welcomed: 'B1', welcoming: 'B1', welcomes: 'B1',
  release: 'B1', released: 'B1', releasing: 'B1', releases: 'B1',
  // B2
  circulate: 'B2', circulates: 'B2', circulated: 'B2', circulating: 'B2',
  occur: 'B2', occurred: 'B2', occurs: 'B2', occurring: 'B2',
  implement: 'B2', implemented: 'B2', implements: 'B2', implementing: 'B2',
  escalate: 'B2', escalated: 'B2', escalates: 'B2', escalating: 'B2',
  postpone: 'B2', postponed: 'B2', postpones: 'B2', postponing: 'B2',
  assess: 'B2', assessing: 'B2', assessed: 'B2', assesses: 'B2',
  measure: 'B2', measures: 'B2', measuring: 'B2', measured: 'B2',
  restrict: 'B2', restricts: 'B2', restricting: 'B2', restricted: 'B2',
  govern: 'B2', governs: 'B2', governing: 'B2', governed: 'B2',
  eligible: 'B2', eligibly: 'B2', eligibility: 'B2', eligibles: 'B2',
  involve: 'B2', involves: 'B2', involving: 'B2', involved: 'B2',
  guarantee: 'B2', guaranteed: 'B2', guaranteeing: 'B2', guarantees: 'B2',
  waive: 'B2', waived: 'B2', waiving: 'B2', waives: 'B2',
  acknowledge: 'B2', acknowledged: 'B2', acknowledging: 'B2', acknowledges: 'B2',
  maintain: 'B2', maintains: 'B2', maintaining: 'B2', maintained: 'B2',
  protect: 'B2', protects: 'B2', protecting: 'B2', protected: 'B2',
  stand: 'B2', stood: 'B2', standing: 'B2', stands: 'B2',
  begin: 'B2', begins: 'B2', beginning: 'B2', began: 'B2',
  expire: 'B2', expires: 'B2', expiring: 'B2', expired: 'B2',
  issue: 'B2', issued: 'B2', issuing: 'B2', issues: 'B2',
  draft: 'B2', drafting: 'B2', drafted: 'B2', drafts: 'B2',
  // C1/C2
  streamline: 'C1', optimize: 'C1', enhance: 'C1', facilitate: 'C1',
  'take place': 'B1', 'takes place': 'B1', 'took place': 'B1', 'taking place': 'B1',
  'will hold': 'B1', hold: 'B1', holding: 'B1', holds: 'B1',
};

function getCEFR(word) {
  if (!word || typeof word !== 'string') return 'B2';
  const w = word.trim().toLowerCase();
  if (WORD_CEFR[w] !== undefined) return WORD_CEFR[w];
  return 'B2';
}

function maxCEFR(cefrA, cefrB) {
  return CEFR_ORDER[cefrA] >= CEFR_ORDER[cefrB] ? cefrA : cefrB;
}

/** 4択の語からテンプレートの CEFR を決める（最も難しい語に合わせる） */
function getCEFRFromChoices(choices) {
  const arr = Array.isArray(choices) ? choices : (choices && typeof choices === 'object' ? Object.values(choices) : []);
  const words = arr.map((c) => String(c).trim()).filter(Boolean);
  if (words.length === 0) return 'B2';
  let cefr = 'A1';
  for (const w of words) {
    cefr = maxCEFR(cefr, getCEFR(w));
  }
  return cefr;
}

/** CEFR → 当アプリのレベル (1-10)。A2→1,2 / B1→3,4 / B2→5,6 / C1→7,8 / C2→9,10 */
function cefrToLevelRange(cefr) {
  switch (cefr) {
    case 'A1': return [1, 1];
    case 'A2': return [1, 2];
    case 'B1': return [3, 4];
    case 'B2': return [5, 6];
    case 'C1': return [7, 8];
    case 'C2': return [9, 10];
    default: return [5, 6];
  }
}

/** テンプレートの移動先レベル（1つ）。範囲内で spread 用のオフセットを足せる */
function cefrToSingleLevel(cefr, spreadIndex = 0) {
  const [min, max] = cefrToLevelRange(cefr);
  const rangeSize = max - min + 1;
  return min + (spreadIndex % rangeSize);
}

module.exports = { getCEFR, getCEFRFromChoices, cefrToLevelRange, cefrToSingleLevel, CEFR_ORDER };
