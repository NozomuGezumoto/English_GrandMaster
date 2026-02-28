/**
 * 辞書に登録されている原型（見出し語）のみを返す対応表。
 * 問題バンクの選択肢に現れる語形 → 原型。表にない語はそのまま返す（推測しない）。
 */

export const FORM_TO_BASE: Record<string, string> = {
  // be
  is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
  // have, do, go
  has: 'have', had: 'have', does: 'do', did: 'do', goes: 'go', going: 'go', gone: 'go', went: 'go',
  // give, make, take, get, send, write
  gave: 'give', given: 'give', makes: 'make', making: 'make', made: 'make',
  takes: 'take', taking: 'take', taken: 'take', took: 'take',
  gets: 'get', getting: 'get', got: 'get', sends: 'send', sending: 'send', sent: 'send',
  writes: 'write', writing: 'write', written: 'write', wrote: 'write',
  // A2 level
  nearer: 'near', nearest: 'near', filled: 'fill', filling: 'fill', meets: 'meet', meeting: 'meet', met: 'meet',
  opens: 'open', opening: 'open', opened: 'open', closes: 'close', closing: 'close', closed: 'close',
  newer: 'new', newest: 'new', waits: 'wait', waiting: 'wait', waited: 'wait',
  tries: 'try', trying: 'try', tried: 'try', needs: 'need', needing: 'need', needed: 'need',
  wants: 'want', wanting: 'want', wanted: 'want', having: 'have',
  checks: 'check', checking: 'check', checked: 'check', enters: 'enter', entering: 'enter', entered: 'enter',
  ordering: 'order', ordered: 'order', orders: 'order', brings: 'bring', bringing: 'bring', brought: 'bring',
  // B1 level
  completing: 'complete', completed: 'complete', completes: 'complete',
  forwarded: 'forward', forwarding: 'forward', forwards: 'forward',
  registered: 'register', registering: 'register', registration: 'register',
  cancelled: 'cancel', cancelling: 'cancel', cancels: 'cancel',
  required: 'require', requiring: 'require', requires: 'require',
  held: 'hold', holding: 'hold', holds: 'hold',
  distributed: 'distribute', distributes: 'distribute', distributing: 'distribute',
  scheduled: 'schedule', scheduling: 'schedule', schedules: 'schedule',
  received: 'receive', receives: 'receive', receiving: 'receive',
  submitted: 'submit', submits: 'submit', submitting: 'submit',
  presented: 'present', presents: 'present', presenting: 'present',
  announced: 'announce', announces: 'announce', announcing: 'announce',
  finalized: 'finalize', finalizes: 'finalize', finalizing: 'finalize',
  reviewed: 'review', reviews: 'review', reviewing: 'review',
  resolved: 'resolve', resolves: 'resolve', resolving: 'resolve',
  circulated: 'circulate', circulates: 'circulate', circulating: 'circulate',
  occurred: 'occur', occurs: 'occur', occurring: 'occur',
  approved: 'approve', approves: 'approve', approving: 'approve',
  implemented: 'implement', implements: 'implement', implementing: 'implement',
  returned: 'return', returns: 'return', returning: 'return',
  escalated: 'escalate', escalates: 'escalate', escalating: 'escalate',
  improved: 'improve', improving: 'improve', improvement: 'improve',
  availability: 'available', avail: 'available', availably: 'available',
  // B2 and beyond
  committed: 'commit', committing: 'commit', commits: 'commit',
  committees: 'committee',
  decided: 'decide', deciding: 'decide', decides: 'decide', decision: 'decide',
  discussed: 'discuss', discussing: 'discuss', discusses: 'discuss',
  expected: 'expect', expects: 'expect', expecting: 'expect',
  evaluated: 'evaluate', evaluating: 'evaluate', evaluates: 'evaluate',
  voted: 'vote', votes: 'vote', voting: 'vote',
  considered: 'consider', considering: 'consider', considers: 'consider',
  accepted: 'accept', accepting: 'accept', accepts: 'accept',
  referred: 'refer', referring: 'refer', refers: 'refer',
  endorsed: 'endorse', endorsing: 'endorse', endorses: 'endorse',
  'is being handled': 'handle', handles: 'handle', handled: 'handle',
  postponed: 'postpone', postpones: 'postpone', postponing: 'postpone',
  assessed: 'assess', assesses: 'assess', assessing: 'assess',
  restricted: 'restrict', restricts: 'restrict', restricting: 'restrict',
  governed: 'govern', governs: 'govern', governing: 'govern',
  involved: 'involve', involves: 'involve', involving: 'involve',
  guaranteed: 'guarantee', guarantees: 'guarantee', guaranteeing: 'guarantee',
  waived: 'waive', waives: 'waive', waiving: 'waive',
  acknowledged: 'acknowledge', acknowledges: 'acknowledge', acknowledging: 'acknowledge',
  maintained: 'maintain', maintains: 'maintain', maintaining: 'maintain',
  protected: 'protect', protects: 'protect', protecting: 'protect',
  extended: 'extend', extends: 'extend', extending: 'extend',
  released: 'release', releases: 'release', releasing: 'release',
  drafted: 'draft', drafts: 'draft', drafting: 'draft',
  facilitated: 'facilitate', facilitates: 'facilitate', facilitating: 'facilitate',
  streamlined: 'streamline', streamlines: 'streamline', streamlining: 'streamline',
  optimized: 'optimize', optimizes: 'optimize', optimizing: 'optimize',
  enhanced: 'enhance', enhances: 'enhance', enhancing: 'enhance',
  // adjective comparative/superlative
  farther: 'far', farthest: 'far', farness: 'far',
  rightly: 'right', rightness: 'right', rightful: 'right',
  // take place
  'takes place': 'take place', 'took place': 'take place', 'taking place': 'take place',
  'will hold': 'hold',
};

/**
 * 辞書登録の原型を返す。表にない語はそのまま返す（推測・ルールは使わない）。
 */
export function toBaseForm(word: string): string {
  const w = word.trim().toLowerCase();
  if (!w) return w;
  if (FORM_TO_BASE[w] !== undefined) return FORM_TO_BASE[w];
  return w;
}
