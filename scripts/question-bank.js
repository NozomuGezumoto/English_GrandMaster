/**
 * レベル別問題テンプレート（各レベル100問を生成）
 * 難易度は Cambridge Dictionary / English Profile (CEFR) に合わせる。
 * level 1-2: A2 Elementary (TOEIC〜400)
 * level 3-4: B1 Intermediate (TOEIC 600)
 * level 5-6: B2 Upper-Intermediate (TOEIC 730)
 * level 7-8: C1 Advanced (TOEIC 860)
 * level 9-10: C2 Proficiency (TOEIC 990)
 * template-levels.json が存在する場合、回答欄の語彙に基づく実効レベルでテンプレートを再割り当てする。
 */

const path = require('path');
const fs = require('fs');
const QUESTIONS_PER_LEVEL = 100;
/** A2（レベル1・2）: 1テンプレートあたり最大出題数。同じ4語の使い回しを防ぎ語彙を増やす */
const MAX_QUESTIONS_PER_TEMPLATE_A2 = 3;

// テンプレート: prompt に [A], [B] などがあり、slots の組み合わせで展開。expand が true のときのみ展開
function normalizeQuestion(level, t, overrides = {}) {
  return {
    lang: 'en',
    exam: 'toeic',
    level,
    prompt: overrides.prompt ?? t.prompt,
    choices: t.choices,
    answerIndex: t.answerIndex,
    explanation: t.explanation,
    type: t.type ?? 'cloze',
    source: 'template',
    active: true,
    qualityStatus: t.qualityStatus ?? 'ok',
    passage: t.passage !== undefined ? t.passage : (t.type === 'reading' ? '' : undefined),
    ...overrides
  };
}

function expandTemplates(level, templates) {
  const out = [];
  for (const t of templates) {
    if (t.slots) {
      const keys = Object.keys(t.slots);
      const values = keys.map(k => t.slots[k]);
      const combinations = cartesian(values);
      for (const combo of combinations) {
        let prompt = t.prompt;
        keys.forEach((k, i) => { prompt = prompt.replace(new RegExp(`\\[${k}\\]`, 'g'), combo[i]); });
        out.push(normalizeQuestion(level, t, { prompt }));
      }
    } else {
      out.push(normalizeQuestion(level, t));
    }
  }
  return out;
}

function cartesian(arrs) {
  if (arrs.length === 0) return [[]];
  const [first, ...rest] = arrs;
  const restCartesian = cartesian(rest);
  const result = [];
  for (const x of first) {
    for (const rest of restCartesian) {
      result.push([x, ...rest]);
    }
  }
  return result;
}

const level1Templates = [
  {
    prompt: 'The [A] is _____ the [B].',
    slots: {
      A: ['office', 'meeting room', 'store', 'factory', 'warehouse', 'cafe', 'restaurant', 'bank', 'hotel', 'gym'],
      B: ['station', 'airport', 'park', 'museum', 'supermarket', 'library', 'hospital', 'school', 'post office', 'mall']
    },
    choices: ['near', 'nearly', 'nearer', 'nearest'],
    answerIndex: 0,
    explanation: '"near" is a preposition meaning close to.'
  },
  {
    prompt: '[A] _____ to work by [B].',
    slots: {
      A: ['She', 'He', 'The manager', 'The director', 'Ms. Smith', 'Mr. Jones', 'The assistant', 'The clerk', 'The secretary', 'The driver'],
      B: ['bus', 'train', 'car', 'bicycle', 'subway', 'taxi', 'ferry', 'motorcycle', 'van', 'tram']
    },
    choices: ['go', 'goes', 'going', 'gone'],
    answerIndex: 1,
    explanation: 'Third person singular present tense takes "goes".'
  },
  {
    prompt: 'Please _____ the [A] and send it back.',
    slots: {
      A: ['form', 'application', 'document', 'survey', 'questionnaire', 'contract', 'agreement', 'checklist', 'report', 'sheet']
    },
    choices: ['fill', 'full', 'filled', 'filling'],
    answerIndex: 0,
    explanation: '"fill" is the base verb used after "please".'
  },
  {
    prompt: 'The [A] is _____ the desk.',
    slots: {
      A: ['book', 'file', 'folder', 'phone', 'computer', 'lamp', 'pen', 'notebook', 'keyboard', 'monitor']
    },
    choices: ['on', 'at', 'in', 'by'],
    answerIndex: 0,
    explanation: '"on" indicates position on top of a surface.'
  },
  {
    prompt: 'I have a [A] at [B] o\'clock.',
    slots: {
      A: ['meeting', 'call', 'appointment', 'interview', 'conference', 'session', 'presentation', 'training', 'review', 'break'],
      B: ['nine', 'ten', 'eleven', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']
    },
    choices: ['at', 'in', 'on', 'for'],
    answerIndex: 0,
    explanation: '"at" is used with specific clock times.'
  },
  {
    prompt: 'This is _____ [A] than the last one.',
    slots: {
      A: ['good', 'big', 'fast', 'cheap', 'easy', 'simple', 'clear', 'short', 'long', 'high']
    },
    choices: ['more', 'most', 'much', 'many'],
    answerIndex: 0,
    explanation: 'Comparative form for longer adjectives uses "more".'
  },
  {
    prompt: 'We _____ [A] every Monday.',
    slots: {
      A: ['meet', 'meets', 'meeting', 'met']
    },
    choices: ['meet', 'meets', 'meeting', 'met'],
    answerIndex: 0,
    explanation: 'Plural subject "we" takes base form "meet" in present tense.'
  },
  {
    prompt: 'There are _____ [A] in the office.',
    slots: {
      A: ['chairs', 'desks', 'computers', 'phones', 'employees', 'rooms', 'windows', 'doors', 'lights', 'printers']
    },
    choices: ['many', 'much', 'lot', 'few'],
    answerIndex: 0,
    explanation: '"many" is used with countable plural nouns.'
  },
  {
    prompt: 'The [A] _____ open at 9 a.m.',
    slots: {
      A: ['office', 'store', 'bank', 'restaurant', 'library', 'gym', 'cafe', 'shop', 'museum', 'reception']
    },
    choices: ['open', 'opens', 'opening', 'opened'],
    answerIndex: 1,
    explanation: 'Third person singular: "opens".'
  },
  {
    prompt: 'Please _____ your [A] here.',
    slots: {
      A: ['name', 'signature', 'address', 'phone number', 'email', 'date', 'ID', 'card', 'form', 'document']
    },
    choices: ['write', 'writes', 'writing', 'written'],
    answerIndex: 0,
    explanation: 'Imperative/please is followed by base form "write".'
  },
  { prompt: 'The [A] is _____ the table.', slots: { A: ['bag', 'box', 'key', 'phone', 'book', 'cup', 'pen', 'laptop', 'file', 'folder'] }, choices: ['under', 'underneath', 'below', 'beneath'], answerIndex: 0, explanation: '"under" means below something.' },
  { prompt: 'The [A] is _____ the building.', slots: { A: ['car', 'bike', 'entrance', 'cafe', 'shop', 'parking', 'garden', 'gate', 'sign', 'bench'] }, choices: ['behind', 'back', 'after', 'rear'], answerIndex: 0, explanation: '"behind" is a preposition for position.' },
  { prompt: 'The office is _____ the bank and the [A].', slots: { A: ['post office', 'pharmacy', 'supermarket', 'school', 'station', 'hotel', 'cafe', 'park', 'museum', 'mall'] }, choices: ['between', 'among', 'middle', 'center'], answerIndex: 0, explanation: '"between" is used for two things.' },
  { prompt: 'I come _____ [A] every day.', slots: { A: ['Tokyo', 'Osaka', 'London', 'New York', 'Paris', 'Berlin', 'Singapore', 'Sydney', 'Toronto', 'Seoul'] }, choices: ['from', 'at', 'in', 'by'], answerIndex: 0, explanation: '"from" indicates origin.' },
  { prompt: 'We go _____ work at 9.', slots: { A: ['to', 'towards', 'into', 'for'] }, choices: ['to', 'towards', 'into', 'for'], answerIndex: 0, explanation: '"go to work" is the fixed phrase.' },
  { prompt: 'Please _____ a seat.', slots: { A: ['take', 'takes', 'taking', 'taken'] }, choices: ['take', 'takes', 'taking', 'taken'], answerIndex: 0, explanation: 'Imperative uses base form "take".' },
  { prompt: 'She _____ me the [A].', slots: { A: ['report', 'file', 'key', 'form', 'document', 'letter', 'message', 'card', 'book', 'copy'] }, choices: ['gave', 'gives', 'giving', 'given'], answerIndex: 0, explanation: 'Past tense "gave".' },
  { prompt: 'We need to _____ a [A].', slots: { A: ['decision', 'plan', 'meeting', 'call', 'reservation', 'booking', 'payment', 'order', 'request', 'list'] }, choices: ['make', 'makes', 'making', 'made'], answerIndex: 0, explanation: '"need to" + base verb "make".' },
  { prompt: 'I want to _____ some [A].', slots: { A: ['coffee', 'water', 'tea', 'food', 'supplies', 'paper', 'copies', 'information', 'help', 'advice'] }, choices: ['get', 'gets', 'getting', 'got'], answerIndex: 0, explanation: '"want to" + base verb "get".' },
  { prompt: 'He _____ the [A] yesterday.', slots: { A: ['report', 'email', 'form', 'document', 'file', 'letter', 'application', 'contract', 'order', 'invoice'] }, choices: ['sent', 'send', 'sends', 'sending'], answerIndex: 0, explanation: 'Past tense "sent".' },
  { prompt: 'This is a _____ [A].', slots: { A: ['computer', 'phone', 'desk', 'room', 'building', 'system', 'process', 'policy', 'rule', 'idea'] }, choices: ['new', 'newer', 'newest', 'newly'], answerIndex: 0, explanation: '"new" is the adjective form.' },
  { prompt: 'The [A] is _____ today.', slots: { A: ['office', 'store', 'bank', 'library', 'gym', 'cafe', 'shop', 'museum', 'reception', 'counter'] }, choices: ['closed', 'close', 'closes', 'closing'], answerIndex: 0, explanation: 'Adjective "closed" describes the state.' },
  { prompt: 'Is this the _____ [A]?', slots: { A: ['way', 'answer', 'key', 'door', 'room', 'office', 'file', 'form', 'time', 'place'] }, choices: ['right', 'rightly', 'rightness', 'rightful'], answerIndex: 0, explanation: '"right" means correct here.' },
  { prompt: 'We have the _____ [A].', slots: { A: ['problem', 'idea', 'question', 'issue', 'task', 'goal', 'plan', 'report', 'result', 'answer'] }, choices: ['same', 'similar', 'equal', 'alike'], answerIndex: 0, explanation: '"the same" is the fixed phrase.' },
  { prompt: 'The [A] is _____ from here.', slots: { A: ['station', 'airport', 'office', 'bank', 'hotel', 'restaurant', 'park', 'museum', 'school', 'hospital'] }, choices: ['far', 'farther', 'farthest', 'farness'], answerIndex: 0, explanation: '"far" is the adjective for distance.' },
  { prompt: 'Please _____ for a moment.', slots: { A: ['wait', 'waits', 'waiting', 'waited'] }, choices: ['wait', 'waits', 'waiting', 'waited'], answerIndex: 0, explanation: 'Imperative "wait".' },
  { prompt: 'They _____ to help us.', slots: { A: ['try', 'tries', 'trying', 'tried'] }, choices: ['try', 'tries', 'trying', 'tried'], answerIndex: 0, explanation: 'Plural "they" + base form "try".' },
  { prompt: 'I _____ to finish the [A].', slots: { A: ['report', 'work', 'task', 'project', 'form', 'document', 'email', 'list', 'plan', 'review'] }, choices: ['need', 'needs', 'needing', 'needed'], answerIndex: 0, explanation: '"I" + base form "need".' },
  { prompt: 'She _____ to speak English.', slots: { A: ['want', 'wants', 'wanting', 'wanted'] }, choices: ['want', 'wants', 'wanting', 'wanted'], answerIndex: 1, explanation: 'Third person "wants".' },
  { prompt: 'We _____ the [A] last week.', slots: { A: ['meeting', 'training', 'event', 'conference', 'session', 'workshop', 'review', 'interview', 'call', 'visit'] }, choices: ['had', 'have', 'has', 'having'], answerIndex: 0, explanation: 'Past tense "had".' },
  { prompt: 'The [A] _____ very helpful.', slots: { A: ['staff', 'team', 'manager', 'guide', 'manual', 'handbook', 'report', 'system', 'tool', 'service'] }, choices: ['was', 'were', 'is', 'are'], answerIndex: 0, explanation: 'Singular subject + past "was".' },
  { prompt: 'There _____ many [A] in the room.', slots: { A: ['people', 'chairs', 'desks', 'computers', 'books', 'files', 'boxes', 'lights', 'windows', 'doors'] }, choices: ['were', 'was', 'is', 'are'], answerIndex: 0, explanation: 'Past plural "there were".' },
  { prompt: 'I _____ the [A] every morning.', slots: { A: ['report', 'email', 'news', 'schedule', 'list', 'message', 'mail', 'update', 'briefing', 'review'] }, choices: ['check', 'checks', 'checking', 'checked'], answerIndex: 0, explanation: '"I" + base form "check".' },
  { prompt: 'Could you _____ the [A]?', slots: { A: ['door', 'window', 'file', 'document', 'light', 'computer', 'printer', 'meeting', 'call', 'booking'] }, choices: ['open', 'opens', 'opening', 'opened'], answerIndex: 0, explanation: '"Could you" + base verb "open".' },
  { prompt: 'The [A] _____ at 6 p.m.', slots: { A: ['office', 'store', 'bank', 'cafe', 'shop', 'library', 'gym', 'reception', 'counter', 'desk'] }, choices: ['closes', 'close', 'closing', 'closed'], answerIndex: 0, explanation: 'Third person "closes".' },
  { prompt: 'Please _____ your [A].', slots: { A: ['password', 'name', 'email', 'number', 'address', 'ID', 'card', 'form', 'answer', 'choice'] }, choices: ['enter', 'enters', 'entering', 'entered'], answerIndex: 0, explanation: 'Imperative "enter".' }
];

const level2Templates = [
  {
    prompt: 'The meeting will start _____ [A] o\'clock.',
    slots: { A: ['9', '10', '11', '2', '3', '4', '5', '6', '7', '8'] },
    choices: ['in', 'on', 'at', 'by'],
    answerIndex: 2,
    explanation: '"at" is used with specific clock times.'
  },
  {
    prompt: 'We need to _____ more [A] for the [B].',
    slots: {
      A: ['paper', 'supplies', 'materials', 'copies', 'forms', 'handouts', 'brochures', 'cards', 'envelopes', 'folders'],
      B: ['printer', 'office', 'meeting', 'department', 'project', 'conference', 'training', 'workshop', 'event', 'team']
    },
    choices: ['order', 'ordering', 'ordered', 'orders'],
    answerIndex: 0,
    explanation: '"need to" is followed by the base form "order".'
  },
  {
    prompt: 'Mr. [A] is _____ charge of the [B] team.',
    slots: {
      A: ['Tanaka', 'Smith', 'Jones', 'Brown', 'Wilson', 'Lee', 'Kim', 'Davis', 'Garcia', 'Martinez'],
      B: ['sales', 'marketing', 'development', 'support', 'design', 'research', 'production', 'quality', 'logistics', 'HR']
    },
    choices: ['at', 'in', 'on', 'for'],
    answerIndex: 1,
    explanation: '"in charge of" is a fixed phrase meaning responsible for.'
  },
  {
    prompt: 'The [A] will be held _____ [B].',
    slots: {
      A: ['meeting', 'conference', 'training', 'seminar', 'workshop', 'event', 'session', 'presentation', 'review', 'briefing'],
      B: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'March 15', 'January 1', 'December 25']
    },
    choices: ['in', 'on', 'at', 'by'],
    answerIndex: 1,
    explanation: '"on" is used with days of the week and dates (e.g. on Monday, on March 15).'
  },
  {
    prompt: 'Could you _____ the [A] to room [B]?',
    slots: {
      A: ['file', 'report', 'package', 'documents', 'materials', 'equipment', 'samples', 'brochures', 'contracts', 'keys'],
      B: ['101', '202', '305', '410', '512', '201', '302', '405', '608', '710']
    },
    choices: ['bring', 'brings', 'bringing', 'brought'],
    answerIndex: 0,
    explanation: '"Could you" is followed by the base form "bring".'
  },
  {
    prompt: 'The [A] is located _____ the [B] floor.',
    slots: {
      A: ['office', 'conference room', 'reception', 'cafeteria', 'lobby', 'meeting room', 'library', 'gym', 'restroom', 'elevator'],
      B: ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']
    },
    choices: ['in', 'on', 'at', 'by'],
    answerIndex: 1,
    explanation: 'Floors use the preposition "on".'
  },
  {
    prompt: 'We received your [A] _____ [B].',
    slots: {
      A: ['order', 'request', 'application', 'inquiry', 'message', 'email', 'letter', 'package', 'payment', 'form'],
      B: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'March 15', 'January 1', 'December 25']
    },
    choices: ['in', 'on', 'at', 'by'],
    answerIndex: 1,
    explanation: '"on" is used with days and dates (e.g. We received your order on Monday).'
  },
  {
    prompt: 'All [A] must wear a [B] in the building.',
    slots: {
      A: ['employees', 'visitors', 'staff', 'contractors', 'guests', 'personnel', 'workers', 'members', 'attendees', 'participants'],
      B: ['badge', 'ID', 'uniform', 'helmet', 'vest', 'mask', 'pass', 'tag', 'lanyard', 'card']
    },
    choices: ['in', 'on', 'at', 'by'],
    answerIndex: 0,
    explanation: '"wear\" something "in" a place is correct.'
  },
  {
    prompt: 'The [A] deadline is _____ the end of [B].',
    slots: {
      A: ['project', 'report', 'application', 'submission', 'registration', 'payment', 'order', 'delivery', 'review', 'audit'],
      B: ['January', 'February', 'March', 'April', 'May', 'June', 'the month', 'the week', 'the quarter', 'the year']
    },
    choices: ['in', 'on', 'at', 'by'],
    answerIndex: 2,
    explanation: '"at the end of" is the correct phrase.'
  },
  {
    prompt: 'Please contact [A] if you have any [B].',
    slots: {
      A: ['HR', 'the manager', 'support', 'reception', 'the front desk', 'admin', 'the director', 'the team', 'IT', 'the office'],
      B: ['questions', 'concerns', 'issues', 'requests', 'problems', 'inquiries', 'feedback', 'suggestions', 'comments', 'ideas']
    },
    choices: ['in', 'on', 'at', 'for'],
    answerIndex: 3,
    explanation: '"contact ... for" or "if you have any [noun]" — "for" fits "contact for questions".'
  }
];

const level3Templates = [
  {
    prompt: 'The [A] should be _____ by next [B].',
    slots: {
      A: ['report', 'document', 'form', 'application', 'proposal', 'analysis', 'summary', 'draft', 'review', 'assessment'],
      B: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'week', 'month', 'quarter', 'deadline', 'session']
    },
    choices: ['complete', 'completing', 'completed', 'completes'],
    answerIndex: 2,
    explanation: 'Passive voice: "should be completed" (past participle).'
  },
  {
    prompt: 'Could you please _____ me the [A]?',
    slots: {
      A: ['file', 'report', 'document', 'form', 'data', 'information', 'summary', 'agenda', 'minutes', 'attachment']
    },
    choices: ['send', 'sending', 'sends', 'sent'],
    answerIndex: 0,
    explanation: '"Could you please" is followed by the base verb "send".'
  },
  {
    prompt: 'The [A] room is _____ for the whole [B].',
    slots: {
      A: ['conference', 'meeting', 'training', 'interview', 'seminar', 'board', 'break', 'rest', 'staff', 'lunch'],
      B: ['afternoon', 'morning', 'day', 'week', 'session', 'period', 'duration', 'meeting', 'event', 'workshop']
    },
    choices: ['available', 'availability', 'avail', 'availably'],
    answerIndex: 0,
    explanation: '"available" is an adjective describing the room.'
  },
  {
    prompt: 'The [A] has been _____ to the [B] department.',
    slots: {
      A: ['report', 'request', 'application', 'inquiry', 'complaint', 'feedback', 'proposal', 'document', 'file', 'message'],
      B: ['sales', 'marketing', 'HR', 'finance', 'IT', 'support', 'operations', 'legal', 'R&D', 'admin']
    },
    choices: ['forward', 'forwarded', 'forwarding', 'forwards'],
    answerIndex: 1,
    explanation: 'Present perfect passive: "has been forwarded".'
  },
  {
    prompt: 'We are _____ for your response.',
    slots: {
      A: ['wait', 'waiting', 'waited', 'waits']
    },
    choices: ['wait', 'waiting', 'waited', 'waits'],
    answerIndex: 1,
    explanation: 'Present continuous: "are waiting".'
  },
  {
    prompt: 'The new [A] will _____ efficiency.',
    slots: {
      A: ['system', 'software', 'process', 'policy', 'tool', 'program', 'method', 'procedure', 'technology', 'platform']
    },
    choices: ['improve', 'improvement', 'improving', 'improved'],
    answerIndex: 0,
    explanation: 'After "will" we use the base verb "improve".'
  },
  {
    prompt: 'Please _____ your [A] at the front desk.',
    slots: {
      A: ['visit', 'arrival', 'attendance', 'name', 'complaint', 'inquiry', 'feedback', 'reservation', 'participation', 'membership']
    },
    choices: ['register', 'registration', 'registered', 'registering'],
    answerIndex: 0,
    explanation: 'Imperative: base form "register".'
  },
  {
    prompt: 'The [A] was _____ last week.',
    slots: {
      A: ['meeting', 'training', 'event', 'conference', 'session', 'workshop', 'seminar', 'review', 'audit', 'inspection']
    },
    choices: ['cancel', 'cancelled', 'cancelling', 'cancels'],
    answerIndex: 1,
    explanation: 'Passive past: "was cancelled".'
  },
  {
    prompt: 'All staff are _____ to attend the [A].',
    slots: {
      A: ['meeting', 'training', 'briefing', 'session', 'conference', 'workshop', 'event', 'presentation', 'review', 'ceremony']
    },
    choices: ['require', 'required', 'requiring', 'requires'],
    answerIndex: 1,
    explanation: '"are required" (passive) is correct here.'
  },
  {
    prompt: 'The [A] will be _____ in room [B].',
    slots: {
      A: ['interview', 'meeting', 'presentation', 'training', 'session', 'briefing', 'review', 'discussion', 'hearing', 'assessment'],
      B: ['101', '202', '305', '410', '512', '201', '302', '405', '608', '710']
    },
    choices: ['hold', 'held', 'holding', 'holds'],
    answerIndex: 1,
    explanation: 'Passive future: "will be held".'
  },
  { prompt: 'The [A] has been _____ to the team.', slots: { A: ['report', 'email', 'message', 'update', 'notice', 'memo', 'briefing', 'summary', 'agenda', 'invitation'] }, choices: ['distributed', 'distribute', 'distributes', 'distributing'], answerIndex: 0, explanation: 'Present perfect passive "has been distributed".' },
  { prompt: 'We _____ the [A] next Monday.', slots: { A: ['meeting', 'call', 'review', 'session', 'training', 'interview', 'audit', 'launch', 'deadline', 'event'] }, choices: ['schedule', 'scheduled', 'scheduling', 'schedules'], answerIndex: 1, explanation: 'Past participle "scheduled" as adjective.' },
  { prompt: 'The [A] was _____ yesterday.', slots: { A: ['package', 'order', 'document', 'file', 'report', 'application', 'payment', 'invoice', 'contract', 'delivery'] }, choices: ['received', 'receive', 'receives', 'receiving'], answerIndex: 0, explanation: 'Passive past "was received".' },
  { prompt: 'Please _____ your [A] by Friday.', slots: { A: ['report', 'form', 'application', 'feedback', 'response', 'confirmation', 'approval', 'submission', 'document', 'assignment'] }, choices: ['submit', 'submits', 'submitting', 'submitted'], answerIndex: 0, explanation: 'Imperative "submit".' },
  { prompt: 'The [A] has been _____ for review.', slots: { A: ['document', 'proposal', 'contract', 'report', 'draft', 'application', 'file', 'manuscript', 'design', 'plan'] }, choices: ['submitted', 'submit', 'submits', 'submitting'], answerIndex: 0, explanation: 'Present perfect passive "has been submitted".' },
  { prompt: 'She _____ the [A] to the client.', slots: { A: ['report', 'proposal', 'presentation', 'document', 'quote', 'estimate', 'contract', 'summary', 'briefing', 'update'] }, choices: ['presented', 'present', 'presents', 'presenting'], answerIndex: 0, explanation: 'Past tense "presented".' },
  { prompt: 'The [A] will be _____ soon.', slots: { A: ['results', 'decision', 'announcement', 'report', 'update', 'notification', 'feedback', 'response', 'confirmation', 'approval'] }, choices: ['announced', 'announce', 'announces', 'announcing'], answerIndex: 0, explanation: 'Passive future "will be announced".' },
  { prompt: 'We have _____ the [A].', slots: { A: ['contract', 'agreement', 'deal', 'order', 'booking', 'reservation', 'partnership', 'arrangement', 'plan', 'schedule'] }, choices: ['finalized', 'finalize', 'finalizes', 'finalizing'], answerIndex: 0, explanation: 'Present perfect "have finalized".' },
  { prompt: 'Could you _____ the [A]?', slots: { A: ['document', 'report', 'file', 'email', 'message', 'attachment', 'form', 'application', 'contract', 'proposal'] }, choices: ['review', 'reviews', 'reviewing', 'reviewed'], answerIndex: 0, explanation: '"Could you" + base verb "review".' },
  { prompt: 'The [A] has been _____ .', slots: { A: ['issue', 'problem', 'matter', 'case', 'request', 'inquiry', 'complaint', 'concern', 'question', 'incident'] }, choices: ['resolved', 'resolve', 'resolves', 'resolving'], answerIndex: 0, explanation: 'Present perfect passive "has been resolved".' },
  { prompt: 'Please _____ the [A] to the [B].', slots: { A: ['report', 'file', 'document', 'copy', 'attachment', 'summary', 'memo', 'agenda', 'minutes', 'briefing'], B: ['team', 'manager', 'client', 'department', 'director', 'committee', 'board', 'stakeholders', 'HR', 'IT'] }, choices: ['circulate', 'circulates', 'circulated', 'circulating'], answerIndex: 0, explanation: 'Imperative "circulate".' },
  { prompt: 'The [A] _____ yesterday.', slots: { A: ['meeting', 'training', 'event', 'session', 'conference', 'workshop', 'webinar', 'briefing', 'review', 'interview'] }, choices: ['occurred', 'occur', 'occurs', 'occurring'], answerIndex: 0, explanation: 'Past tense "occurred".' },
  { prompt: 'We need to _____ the [A].', slots: { A: ['budget', 'plan', 'schedule', 'process', 'policy', 'contract', 'proposal', 'design', 'strategy', 'timeline'] }, choices: ['approve', 'approves', 'approved', 'approving'], answerIndex: 0, explanation: '"need to" + base verb "approve".' },
  { prompt: 'The [A] has been _____.', slots: { A: ['application', 'request', 'proposal', 'contract', 'order', 'booking', 'reservation', 'subscription', 'registration', 'permission'] }, choices: ['approved', 'approve', 'approves', 'approving'], answerIndex: 0, explanation: 'Present perfect passive "has been approved".' },
  { prompt: 'They _____ the [A] last month.', slots: { A: ['system', 'software', 'process', 'policy', 'equipment', 'facility', 'service', 'product', 'program', 'platform'] }, choices: ['implemented', 'implement', 'implements', 'implementing'], answerIndex: 0, explanation: 'Past tense "implemented".' },
  { prompt: 'The [A] will _____ in [B].', slots: { A: ['meeting', 'training', 'event', 'launch', 'conference', 'session', 'webinar', 'deadline', 'review', 'audit'], B: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October'] }, choices: ['take place', 'takes place', 'took place', 'taking place'], answerIndex: 0, explanation: 'Future "will take place".' },
  { prompt: 'Please _____ the [A] by [B].', slots: { A: ['form', 'application', 'report', 'document', 'feedback', 'response', 'confirmation', 'approval', 'submission', 'assignment'], B: ['noon', '5 p.m.', 'Friday', 'next week', 'the deadline', 'tomorrow', 'Monday', 'the end of the day', 'next month', 'January 15'] }, choices: ['return', 'returns', 'returned', 'returning'], answerIndex: 0, explanation: 'Imperative "return".' },
  { prompt: 'The [A] has been _____ to [B].', slots: { A: ['report', 'request', 'application', 'inquiry', 'complaint', 'feedback', 'proposal', 'document', 'file', 'message'], B: ['management', 'the board', 'HR', 'legal', 'finance', 'the director', 'the committee', 'support', 'the client', 'admin'] }, choices: ['escalated', 'escalate', 'escalates', 'escalating'], answerIndex: 0, explanation: 'Present perfect passive "has been escalated".' },
  { prompt: 'We _____ the [A] next week.', slots: { A: ['meeting', 'call', 'review', 'session', 'training', 'interview', 'audit', 'launch', 'event', 'webinar'] }, choices: ['will hold', 'hold', 'holds', 'holding'], answerIndex: 0, explanation: 'Future "will hold".' },
  { prompt: 'The [A] _____ by the [B] team.', slots: { A: ['project', 'report', 'system', 'design', 'analysis', 'review', 'audit', 'assessment', 'implementation', 'launch'], B: ['development', 'marketing', 'sales', 'support', 'research', 'quality', 'operations', 'finance', 'HR', 'IT'] }, choices: ['is being handled', 'handle', 'handles', 'handled'], answerIndex: 0, explanation: 'Present continuous passive "is being handled".' },
  { prompt: 'All [A] must be _____ before [B].', slots: { A: ['forms', 'applications', 'reports', 'documents', 'submissions', 'requests', 'approvals', 'confirmations', 'registrations', 'bookings'], B: ['the deadline', 'Friday', 'noon', 'next week', 'the meeting', 'the end of the month', 'tomorrow', 'January', 'the launch', 'the audit'] }, choices: ['completed', 'complete', 'completes', 'completing'], answerIndex: 0, explanation: 'Passive "must be completed".' },
  { prompt: 'She _____ the [A] to the [B].', slots: { A: ['report', 'proposal', 'document', 'file', 'summary', 'briefing', 'update', 'analysis', 'draft', 'agenda'], B: ['director', 'manager', 'client', 'board', 'committee', 'team', 'stakeholders', 'HR', 'finance', 'legal'] }, choices: ['forwarded', 'forward', 'forwards', 'forwarding'], answerIndex: 0, explanation: 'Past tense "forwarded".' },
  { prompt: 'The [A] was _____ due to [B].', slots: { A: ['meeting', 'event', 'training', 'session', 'flight', 'delivery', 'shipment', 'appointment', 'interview', 'webinar'], B: ['bad weather', 'technical issues', 'scheduling conflicts', 'budget cuts', 'low attendance', 'unforeseen circumstances', 'staff shortage', 'equipment failure', 'security concerns', 'legal issues'] }, choices: ['postponed', 'postpone', 'postpones', 'postponing'], answerIndex: 0, explanation: 'Passive past "was postponed".' },
  { prompt: 'We _____ to [A] the [B].', slots: { A: ['update', 'revise', 'improve', 'expand', 'simplify', 'streamline', 'modernize', 'optimize', 'enhance', 'upgrade'], B: ['system', 'process', 'policy', 'procedure', 'software', 'document', 'report', 'guideline', 'template', 'framework'] }, choices: ['decided', 'decide', 'decides', 'deciding'], answerIndex: 0, explanation: 'Past tense "decided".' },
  { prompt: 'The [A] _____ on [B].', slots: { A: ['report', 'decision', 'announcement', 'update', 'feedback', 'result', 'outcome', 'finding', 'conclusion', 'recommendation'], B: ['Monday', 'Tuesday', 'last week', 'next month', 'January 15', 'the 20th', 'Friday', 'yesterday', 'tomorrow', 'the deadline'] }, choices: ['will be released', 'release', 'releases', 'releasing'], answerIndex: 0, explanation: 'Passive future "will be released".' }
];

const level4Templates = [
  {
    prompt: 'We have _____ the deadline to [A].',
    slots: {
      A: ['next week', 'next month', 'Friday', 'the end of March', 'next quarter', 'tomorrow', 'next Tuesday', 'the 15th', 'next year', 'next Monday']
    },
    choices: ['extended', 'extend', 'extends', 'extending'],
    answerIndex: 0,
    explanation: 'Present perfect "have extended" for a completed action with present result.'
  },
  {
    prompt: 'The new [A] will _____ [B].',
    slots: {
      A: ['software', 'system', 'policy', 'process', 'tool', 'program', 'method', 'technology', 'platform', 'procedure'],
      B: ['productivity', 'efficiency', 'performance', 'quality', 'accuracy', 'speed', 'output', 'results', 'satisfaction', 'communication']
    },
    choices: ['improve', 'improvement', 'improving', 'improved'],
    answerIndex: 0,
    explanation: 'After "will" we use the base verb "improve".'
  },
  {
    prompt: 'All employees must _____ the [A] training.',
    slots: {
      A: ['safety', 'security', 'compliance', 'orientation', 'mandatory', 'annual', 'professional', 'technical', 'customer service', 'leadership']
    },
    choices: ['attend', 'attendance', 'attended', 'attending'],
    answerIndex: 0,
    explanation: '"must" is followed by the base form "attend".'
  },
  {
    prompt: 'The [A] has been _____ successfully.',
    slots: {
      A: ['project', 'task', 'order', 'transaction', 'installation', 'migration', 'upgrade', 'audit', 'review', 'inspection']
    },
    choices: ['complete', 'completed', 'completing', 'completes'],
    answerIndex: 1,
    explanation: 'Present perfect passive: "has been completed".'
  },
  {
    prompt: 'We need to _____ the [A] before [B].',
    slots: {
      A: ['report', 'proposal', 'document', 'application', 'submission', 'analysis', 'assessment', 'review', 'draft', 'contract'],
      B: ['Friday', 'the meeting', 'the deadline', 'noon', 'next week', 'the end of the day', 'tomorrow', 'the presentation', 'signing', 'approval']
    },
    choices: ['finalize', 'finalized', 'finalizing', 'finalizes'],
    answerIndex: 0,
    explanation: '"need to" is followed by base form "finalize".'
  },
  {
    prompt: 'The [A] will be _____ by the [B] department.',
    slots: {
      A: ['report', 'analysis', 'review', 'audit', 'assessment', 'inspection', 'evaluation', 'survey', 'study', 'research'],
      B: ['finance', 'HR', 'IT', 'operations', 'legal', 'quality', 'R&D', 'marketing', 'sales', 'support']
    },
    choices: ['conduct', 'conducted', 'conducting', 'conducts'],
    answerIndex: 1,
    explanation: 'Passive: "will be conducted".'
  },
  {
    prompt: 'Please _____ the attachment for more [A].',
    slots: {
      A: ['details', 'information', 'instructions', 'guidelines', 'requirements', 'specifications', 'data', 'content', 'documentation', 'reference']
    },
    choices: ['see', 'seeing', 'saw', 'seen'],
    answerIndex: 0,
    explanation: 'Imperative: "see" (base form).'
  },
  {
    prompt: 'The company has _____ a new [A] in [B].',
    slots: {
      A: ['office', 'branch', 'factory', 'store', 'headquarters', 'facility', 'center', 'outlet', 'warehouse', 'lab'],
      B: ['Tokyo', 'Osaka', 'Singapore', 'London', 'New York', 'Seoul', 'Bangkok', 'Sydney', 'Dubai', 'Paris']
    },
    choices: ['open', 'opened', 'opening', 'opens'],
    answerIndex: 1,
    explanation: 'Present perfect: "has opened".'
  },
  {
    prompt: 'All [A] should be _____ by 5 p.m.',
    slots: {
      A: ['submissions', 'reports', 'applications', 'requests', 'orders', 'forms', 'documents', 'inquiries', 'responses', 'feedbacks']
    },
    choices: ['submit', 'submitted', 'submitting', 'submits'],
    answerIndex: 1,
    explanation: 'Passive: "should be submitted".'
  },
  {
    prompt: 'The [A] is scheduled to _____ on [B].',
    slots: {
      A: ['meeting', 'conference', 'training', 'webinar', 'event', 'session', 'presentation', 'workshop', 'seminar', 'briefing'],
      B: ['Monday', 'Tuesday', 'March 15', 'next week', 'the 20th', 'Friday', 'next month', 'April 1', 'tomorrow', 'next quarter']
    },
    choices: ['hold', 'be held', 'holding', 'held'],
    answerIndex: 1,
    explanation: '"is scheduled to be held" is the correct passive infinitive.'
  }
];

// Level 5–6: 中〜上級（730） — ユニーク100問
const level5Templates = [
  { prompt: 'The meeting was _____ postponed due to bad weather.', choices: ['suddenly', 'recently', 'temporarily', 'immediately'], answerIndex: 2, explanation: '"temporarily" means for a limited time.' },
  { prompt: 'The shipment was _____ by one week.', choices: ['delayed', 'delivering', 'deliver', 'delivery'], answerIndex: 0, explanation: 'Past passive: "was delayed".' },
  { prompt: 'The committee _____ to approve the budget.', choices: ['decided', 'decision', 'deciding', 'decides'], answerIndex: 0, explanation: 'Past tense "decided" fits the context.' },
  { prompt: 'Employees are _____ to report any safety concerns.', choices: ['encourage', 'encouraged', 'encouraging', 'encourages'], answerIndex: 1, explanation: 'Passive: "are encouraged".' },
  { prompt: 'The contract will _____ effect next month.', choices: ['take', 'make', 'have', 'get'], answerIndex: 0, explanation: '"take effect" is the correct phrase.' },
  { prompt: 'We need to _____ the issue with the client.', choices: ['address', 'addressing', 'addressed', 'addresses'], answerIndex: 0, explanation: '"need to" + base form "address".' },
  { prompt: 'The report _____ several key findings.', choices: ['highlight', 'highlights', 'highlighting', 'highlighted'], answerIndex: 1, explanation: 'Third person singular: "highlights".' },
  { prompt: 'Please _____ your availability for next week.', choices: ['confirm', 'confirms', 'confirming', 'confirmed'], answerIndex: 0, explanation: 'Imperative: base form "confirm".' },
  { prompt: 'The project is _____ schedule.', choices: ['in', 'on', 'at', 'by'], answerIndex: 1, explanation: '"on schedule" means on time.' },
  { prompt: 'The invoice has not been _____ yet.', choices: ['pay', 'paid', 'paying', 'pays'], answerIndex: 1, explanation: 'Past participle "paid" in passive.' },
  { prompt: 'We will _____ the order within two business days.', choices: ['process', 'processed', 'processing', 'processes'], answerIndex: 0, explanation: '"will" + base form "process".' },
  { prompt: 'The manager _____ the new policy at the meeting.', choices: ['announce', 'announced', 'announcing', 'announces'], answerIndex: 1, explanation: 'Past tense "announced".' },
  { prompt: 'All applications must be _____ by Friday.', choices: ['submit', 'submitted', 'submitting', 'submits'], answerIndex: 1, explanation: 'Passive: "must be submitted".' },
  { prompt: 'The office will be _____ for the holiday.', choices: ['close', 'closed', 'closing', 'closes'], answerIndex: 1, explanation: 'Passive adjective "closed".' },
  { prompt: 'Please _____ the attachment before replying.', choices: ['review', 'reviewed', 'reviewing', 'reviews'], answerIndex: 0, explanation: 'Imperative: base form "review".' },
  { prompt: 'The deadline has been _____ to next Monday.', choices: ['extend', 'extended', 'extending', 'extends'], answerIndex: 1, explanation: 'Past participle "extended".' },
  { prompt: 'The system will be _____ for maintenance tonight.', choices: ['unavailable', 'unavailably', 'unavailability', 'unavailables'], answerIndex: 0, explanation: 'Adjective "unavailable".' },
  { prompt: 'We _____ your feedback on the proposal.', choices: ['appreciate', 'appreciated', 'appreciating', 'appreciates'], answerIndex: 0, explanation: 'Present tense "appreciate".' },
  { prompt: 'The training session has been _____.', choices: ['cancel', 'cancelled', 'cancelling', 'cancels'], answerIndex: 1, explanation: 'Past participle "cancelled".' },
  { prompt: 'Please _____ your password every 90 days.', choices: ['change', 'changed', 'changing', 'changes'], answerIndex: 0, explanation: 'Imperative: base form "change".' },
  { prompt: 'The report _____ the sales figures for Q3.', choices: ['include', 'includes', 'including', 'included'], answerIndex: 1, explanation: 'Third person "includes".' },
  { prompt: 'We are _____ to announce a new partnership.', choices: ['please', 'pleased', 'pleasing', 'pleases'], answerIndex: 1, explanation: 'Adjective "pleased".' },
  { prompt: 'The position has been _____ with an internal candidate.', choices: ['fill', 'filled', 'filling', 'fills'], answerIndex: 1, explanation: 'Passive: "has been filled".' },
  { prompt: 'Employees are _____ to take breaks every two hours.', choices: ['encourage', 'encouraged', 'encouraging', 'encourages'], answerIndex: 1, explanation: 'Passive "are encouraged".' },
  { prompt: 'The meeting was _____ due to low attendance.', choices: ['reschedule', 'rescheduled', 'rescheduling', 'reschedules'], answerIndex: 1, explanation: 'Past passive "was rescheduled".' },
  { prompt: 'We need to _____ the contract before signing.', choices: ['revise', 'revised', 'revising', 'revises'], answerIndex: 0, explanation: '"need to" + base form "revise".' },
  { prompt: 'The budget _____ for the new fiscal year.', choices: ['approve', 'approved', 'approving', 'approves'], answerIndex: 1, explanation: 'Can be read as "was approved" / "has been approved".' },
  { prompt: 'Please _____ the document and return it by email.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 0, explanation: 'Imperative: base form "complete".' },
  { prompt: 'The shipment _____ yesterday afternoon.', choices: ['arrive', 'arrived', 'arriving', 'arrives'], answerIndex: 1, explanation: 'Past tense "arrived".' },
  { prompt: 'We _____ to hear from you soon.', choices: ['look', 'looked', 'looking', 'looks'], answerIndex: 2, explanation: '"look forward to" - present continuous.' },
  { prompt: 'The software will be _____ next week.', choices: ['update', 'updated', 'updating', 'updates'], answerIndex: 1, explanation: 'Passive: "will be updated".' },
  { prompt: 'All staff must _____ the safety guidelines.', choices: ['follow', 'followed', 'following', 'follows'], answerIndex: 0, explanation: '"must" + base form "follow".' },
  { prompt: 'The presentation _____ at 3 p.m. tomorrow.', choices: ['begin', 'begins', 'beginning', 'began'], answerIndex: 1, explanation: 'Scheduled future: "begins".' },
  { prompt: 'We have _____ the issue to the technical team.', choices: ['refer', 'referred', 'referring', 'refers'], answerIndex: 1, explanation: 'Present perfect "have referred".' },
  { prompt: 'The new policy _____ effect in January.', choices: ['take', 'takes', 'taking', 'took'], answerIndex: 1, explanation: 'Third person "takes effect".' },
  { prompt: 'Please _____ the form and submit it online.', choices: ['download', 'downloaded', 'downloading', 'downloads'], answerIndex: 0, explanation: 'Imperative: base form "download".' },
  { prompt: 'The conference room is _____ for the whole day.', choices: ['book', 'booked', 'booking', 'books'], answerIndex: 1, explanation: 'Adjective "booked".' },
  { prompt: 'We _____ your prompt response.', choices: ['anticipate', 'anticipated', 'anticipating', 'anticipates'], answerIndex: 0, explanation: 'Present "anticipate".' },
  { prompt: 'The application was _____ last week.', choices: ['receive', 'received', 'receiving', 'receives'], answerIndex: 1, explanation: 'Passive "was received".' },
  { prompt: 'All expenses must be _____ with receipts.', choices: ['submit', 'submitted', 'submitting', 'submits'], answerIndex: 1, explanation: 'Passive "must be submitted".' },
  { prompt: 'The company _____ a profit this quarter.', choices: ['report', 'reported', 'reporting', 'reports'], answerIndex: 1, explanation: 'Past "reported".' },
  { prompt: 'We are _____ to provide further details upon request.', choices: ['happy', 'happily', 'happiness', 'happier'], answerIndex: 0, explanation: 'Adjective "happy".' },
  { prompt: 'The event will be _____ in the main hall.', choices: ['hold', 'held', 'holding', 'holds'], answerIndex: 1, explanation: 'Passive "will be held".' },
  { prompt: 'Please _____ your supervisor if you have questions.', choices: ['contact', 'contacted', 'contacting', 'contacts'], answerIndex: 0, explanation: 'Imperative "contact".' },
  { prompt: 'The survey _____ that satisfaction has improved.', choices: ['show', 'showed', 'showing', 'shows'], answerIndex: 3, explanation: 'Present "shows".' },
  { prompt: 'We have _____ the date to next Friday.', choices: ['move', 'moved', 'moving', 'moves'], answerIndex: 1, explanation: 'Present perfect "have moved".' },
  { prompt: 'The report _____ several recommendations.', choices: ['contain', 'contains', 'containing', 'contained'], answerIndex: 1, explanation: 'Third person "contains".' },
  { prompt: 'All participants must _____ by 9 a.m.', choices: ['register', 'registered', 'registering', 'registers'], answerIndex: 0, explanation: '"must" + base form "register".' },
  { prompt: 'The contract _____ both parties to confidentiality.', choices: ['bind', 'binds', 'binding', 'bound'], answerIndex: 1, explanation: 'Third person "binds".' },
  { prompt: 'We _____ your cooperation in this matter.', choices: ['request', 'requested', 'requesting', 'requests'], answerIndex: 0, explanation: 'Present "request".' },
  { prompt: 'The position was _____ last month.', choices: ['advertise', 'advertised', 'advertising', 'advertises'], answerIndex: 1, explanation: 'Passive "was advertised".' },
  { prompt: 'Please _____ the instructions carefully.', choices: ['read', 'readed', 'reading', 'reads'], answerIndex: 0, explanation: 'Imperative "read".' },
  { prompt: 'The office will _____ at 6 p.m. today.', choices: ['close', 'closed', 'closing', 'closes'], answerIndex: 0, explanation: '"will" + base form "close".' },
  { prompt: 'We are _____ for your support.', choices: ['grateful', 'gratefully', 'gratitude', 'gratefulness'], answerIndex: 0, explanation: 'Adjective "grateful".' },
  { prompt: 'The meeting has been _____ until further notice.', choices: ['postpone', 'postponed', 'postponing', 'postpones'], answerIndex: 1, explanation: 'Passive "has been postponed".' },
  { prompt: 'All documents must be _____ in PDF format.', choices: ['send', 'sent', 'sending', 'sends'], answerIndex: 1, explanation: 'Passive "must be sent".' },
  { prompt: 'The committee _____ the proposal yesterday.', choices: ['discuss', 'discussed', 'discussing', 'discusses'], answerIndex: 1, explanation: 'Past "discussed".' },
  { prompt: 'We need to _____ the issue as soon as possible.', choices: ['resolve', 'resolved', 'resolving', 'resolves'], answerIndex: 0, explanation: '"need to" + base form "resolve".' },
  { prompt: 'The new product will be _____ next month.', choices: ['launch', 'launched', 'launching', 'launches'], answerIndex: 1, explanation: 'Passive "will be launched".' },
  { prompt: 'Please _____ your attendance at the workshop.', choices: ['confirm', 'confirmed', 'confirming', 'confirms'], answerIndex: 0, explanation: 'Imperative "confirm".' },
  { prompt: 'The budget has been _____ by 10%.', choices: ['reduce', 'reduced', 'reducing', 'reduces'], answerIndex: 1, explanation: 'Passive "has been reduced".' },
  { prompt: 'We _____ to inform you of the delay.', choices: ['regret', 'regretted', 'regretting', 'regrets'], answerIndex: 0, explanation: 'Present "regret".' },
  { prompt: 'The application deadline has been _____.', choices: ['extend', 'extended', 'extending', 'extends'], answerIndex: 1, explanation: 'Passive "has been extended".' },
  { prompt: 'All employees are _____ to attend the training.', choices: ['require', 'required', 'requiring', 'requires'], answerIndex: 1, explanation: 'Passive "are required".' },
  { prompt: 'The report _____ the market trends.', choices: ['analyze', 'analyzes', 'analyzing', 'analyzed'], answerIndex: 1, explanation: 'Third person "analyzes".' },
  { prompt: 'We have _____ the error in the system.', choices: ['correct', 'corrected', 'correcting', 'corrects'], answerIndex: 1, explanation: 'Present perfect "have corrected".' },
  { prompt: 'The invoice should be _____ within 30 days.', choices: ['pay', 'paid', 'paying', 'pays'], answerIndex: 1, explanation: 'Passive "should be paid".' },
  { prompt: 'Please _____ the agenda before the meeting.', choices: ['circulate', 'circulated', 'circulating', 'circulates'], answerIndex: 0, explanation: 'Imperative "circulate".' },
  { prompt: 'The project _____ on time and within budget.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 1, explanation: 'Past "completed".' },
  { prompt: 'We are _____ to assist you.', choices: ['available', 'availably', 'availability', 'availables'], answerIndex: 0, explanation: 'Adjective "available".' },
  { prompt: 'The policy _____ all full-time staff.', choices: ['apply to', 'applies to', 'applying to', 'applied to'], answerIndex: 1, explanation: 'Third person "applies to".' },
  { prompt: 'All requests must be _____ in writing.', choices: ['submit', 'submitted', 'submitting', 'submits'], answerIndex: 1, explanation: 'Passive "must be submitted".' },
  { prompt: 'The data _____ a clear trend.', choices: ['suggest', 'suggests', 'suggesting', 'suggested'], answerIndex: 1, explanation: 'Third person "suggests".' },
  { prompt: 'We _____ your patience during the transition.', choices: ['appreciate', 'appreciated', 'appreciating', 'appreciates'], answerIndex: 0, explanation: 'Present "appreciate".' },
  { prompt: 'The vacancy has been _____ internally.', choices: ['fill', 'filled', 'filling', 'fills'], answerIndex: 1, explanation: 'Passive "has been filled".' },
  { prompt: 'Please _____ the attachment to your reply.', choices: ['attach', 'attached', 'attaching', 'attaches'], answerIndex: 0, explanation: 'Imperative "attach".' },
  { prompt: 'The seminar _____ at 2 p.m.', choices: ['start', 'starts', 'starting', 'started'], answerIndex: 1, explanation: 'Scheduled "starts".' },
  { prompt: 'We have _____ the matter to management.', choices: ['escalate', 'escalated', 'escalating', 'escalates'], answerIndex: 1, explanation: 'Present perfect "have escalated".' },
  { prompt: 'The agreement _____ both parties equally.', choices: ['benefit', 'benefits', 'benefiting', 'benefited'], answerIndex: 1, explanation: 'Third person "benefits".' },
  { prompt: 'All changes must be _____ by the director.', choices: ['approve', 'approved', 'approving', 'approves'], answerIndex: 1, explanation: 'Passive "must be approved".' },
  { prompt: 'The system _____ automatically at midnight.', choices: ['backup', 'backups', 'backing up', 'backs up'], answerIndex: 3, explanation: 'Phrasal verb "backs up".' },
  { prompt: 'We _____ to receiving your application.', choices: ['look', 'looked', 'looking', 'looks'], answerIndex: 2, explanation: '"look forward to".' },
  { prompt: 'The fee will be _____ from your account.', choices: ['deduct', 'deducted', 'deducting', 'deducts'], answerIndex: 1, explanation: 'Passive "will be deducted".' },
  { prompt: 'Please _____ the guidelines before proceeding.', choices: ['consult', 'consulted', 'consulting', 'consults'], answerIndex: 0, explanation: 'Imperative "consult".' },
  { prompt: 'The meeting _____ at 10 a.m. as scheduled.', choices: ['proceed', 'proceeded', 'proceeding', 'proceeds'], answerIndex: 3, explanation: 'Present "proceeds".' },
  { prompt: 'We are _____ the situation closely.', choices: ['monitor', 'monitoring', 'monitored', 'monitors'], answerIndex: 1, explanation: 'Present continuous "monitoring".' },
  { prompt: 'The results _____ our expectations.', choices: ['exceed', 'exceeded', 'exceeding', 'exceeds'], answerIndex: 1, explanation: 'Past "exceeded".' },
  { prompt: 'All staff are _____ to use the new system.', choices: ['train', 'trained', 'training', 'trains'], answerIndex: 1, explanation: 'Passive "are trained".' },
  { prompt: 'The department _____ three new employees.', choices: ['hire', 'hired', 'hiring', 'hires'], answerIndex: 1, explanation: 'Past "hired".' },
  { prompt: 'We _____ your immediate attention to this matter.', choices: ['require', 'required', 'requiring', 'requires'], answerIndex: 0, explanation: 'Present "require".' },
  { prompt: 'The software is _____ for download.', choices: ['ready', 'readily', 'readiness', 'readier'], answerIndex: 0, explanation: 'Adjective "ready".' },
  { prompt: 'Please _____ the document for errors.', choices: ['check', 'checked', 'checking', 'checks'], answerIndex: 0, explanation: 'Imperative "check".' },
  { prompt: 'The campaign _____ next week.', choices: ['begin', 'begins', 'beginning', 'began'], answerIndex: 1, explanation: 'Scheduled "begins".' },
  { prompt: 'We have _____ the issue with the vendor.', choices: ['raise', 'raised', 'raising', 'raises'], answerIndex: 1, explanation: 'Present perfect "have raised".' },
  { prompt: 'The policy _____ all contractors.', choices: ['cover', 'covers', 'covering', 'covered'], answerIndex: 1, explanation: 'Third person "covers".' },
  { prompt: 'All visitors must _____ at reception.', choices: ['sign in', 'signed in', 'signing in', 'signs in'], answerIndex: 0, explanation: '"must" + base form "sign in".' },
  { prompt: 'The proposal was _____ by the board.', choices: ['accept', 'accepted', 'accepting', 'accepts'], answerIndex: 1, explanation: 'Passive "was accepted".' },
  { prompt: 'We _____ your interest in the position.', choices: ['welcome', 'welcomed', 'welcoming', 'welcomes'], answerIndex: 0, explanation: 'Present "welcome".' },
  { prompt: 'The deadline is _____ at 5 p.m. Friday.', choices: ['set', 'setting', 'sets', 'settled'], answerIndex: 0, explanation: 'Adjective "set".' },
  { prompt: 'Please _____ your out-of-office message.', choices: ['activate', 'activated', 'activating', 'activates'], answerIndex: 0, explanation: 'Imperative "activate".' },
  { prompt: 'The survey _____ high satisfaction rates.', choices: ['reveal', 'reveals', 'revealing', 'revealed'], answerIndex: 1, explanation: 'Third person "reveals".' },
  { prompt: 'We are _____ to finalize the agreement.', choices: ['prepare', 'prepared', 'preparing', 'prepares'], answerIndex: 2, explanation: 'Present continuous "preparing".' },
  { prompt: 'The contract _____ in duplicate.', choices: ['issue', 'issued', 'issuing', 'issues'], answerIndex: 1, explanation: 'Passive sense "issued".' },
  { prompt: 'All responses will be _____ within 24 hours.', choices: ['acknowledge', 'acknowledged', 'acknowledging', 'acknowledges'], answerIndex: 1, explanation: 'Passive "will be acknowledged".' },
  { prompt: 'The office is _____ on public holidays.', choices: ['close', 'closed', 'closing', 'closes'], answerIndex: 1, explanation: 'Adjective "closed".' },
  { prompt: 'We _____ to clarify the requirements.', choices: ['seek', 'sought', 'seeking', 'seeks'], answerIndex: 0, explanation: 'Present "seek".' },
  { prompt: 'The report has been _____ to the client.', choices: ['forward', 'forwarded', 'forwarding', 'forwards'], answerIndex: 1, explanation: 'Passive "has been forwarded".' },
  { prompt: 'Please _____ the link to access the portal.', choices: ['click', 'clicked', 'clicking', 'clicks'], answerIndex: 0, explanation: 'Imperative "click".' },
  { prompt: 'The training _____ all new hires.', choices: ['mandatory', 'mandatorily', 'mandate', 'mandates'], answerIndex: 0, explanation: 'Adjective "mandatory".' },
  { prompt: 'We have _____ the meeting to Tuesday.', choices: ['shift', 'shifted', 'shifting', 'shifts'], answerIndex: 1, explanation: 'Present perfect "have shifted".' },
  { prompt: 'The fee _____ according to usage.', choices: ['vary', 'varies', 'varying', 'varied'], answerIndex: 1, explanation: 'Third person "varies".' },
  { prompt: 'All submissions must be _____ in English.', choices: ['write', 'written', 'writing', 'writes'], answerIndex: 1, explanation: 'Passive "must be written".' },
  { prompt: 'The committee _____ a decision next week.', choices: ['expect', 'expects', 'expecting', 'expected'], answerIndex: 1, explanation: 'Present "expects".' },
  { prompt: 'We _____ your understanding.', choices: ['value', 'valued', 'valuing', 'values'], answerIndex: 0, explanation: 'Present "value".' },
  { prompt: 'The discount _____ to members only.', choices: ['apply', 'applies', 'applying', 'applied'], answerIndex: 1, explanation: 'Third person "applies".' },
  { prompt: 'Please _____ the attachment.', choices: ['open', 'opened', 'opening', 'opens'], answerIndex: 0, explanation: 'Imperative "open".' },
  { prompt: 'The event _____ over 200 attendees.', choices: ['draw', 'drew', 'drawing', 'draws'], answerIndex: 1, explanation: 'Past "drew".' },
  { prompt: 'We are _____ to help with the migration.', choices: ['commit', 'committed', 'committing', 'commits'], answerIndex: 1, explanation: 'Adjective "committed".' },
  { prompt: 'The rate _____ every quarter.', choices: ['review', 'reviewed', 'reviewing', 'reviews'], answerIndex: 3, explanation: 'Present "reviews".' },
  { prompt: 'All inquiries should be _____ to the help desk.', choices: ['direct', 'directed', 'directing', 'directs'], answerIndex: 1, explanation: 'Passive "should be directed".' },
  { prompt: 'The software _____ with Windows 10.', choices: ['compatible', 'compatibly', 'compatibility', 'compatibles'], answerIndex: 0, explanation: 'Adjective "compatible".' },
  { prompt: 'We _____ to update you shortly.', choices: ['promise', 'promised', 'promising', 'promises'], answerIndex: 0, explanation: 'Present "promise".' },
  { prompt: 'The form must be _____ in block letters.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 1, explanation: 'Passive "must be completed".' },
  { prompt: 'Please _____ any discrepancies to HR.', choices: ['report', 'reported', 'reporting', 'reports'], answerIndex: 0, explanation: 'Imperative "report".' },
  { prompt: 'The budget _____ approved last month.', choices: ['get', 'got', 'getting', 'gets'], answerIndex: 1, explanation: 'Past "got" (was got = was approved).' },
  { prompt: 'We have _____ the terms with the supplier.', choices: ['agree', 'agreed', 'agreeing', 'agrees'], answerIndex: 1, explanation: 'Present perfect "have agreed".' },
  { prompt: 'The update _____ security improvements.', choices: ['include', 'includes', 'including', 'included'], answerIndex: 1, explanation: 'Third person "includes".' },
  { prompt: 'All candidates must _____ the assessment.', choices: ['take', 'taken', 'taking', 'takes'], answerIndex: 0, explanation: '"must" + base form "take".' },
  { prompt: 'The office _____ at 8 a.m. on weekdays.', choices: ['open', 'opens', 'opening', 'opened'], answerIndex: 1, explanation: 'Present "opens".' },
  { prompt: 'We _____ your application has been received.', choices: ['confirm', 'confirmed', 'confirming', 'confirms'], answerIndex: 0, explanation: 'Present "confirm".' },
  { prompt: 'The policy _____ annual leave entitlement.', choices: ['specify', 'specifies', 'specifying', 'specified'], answerIndex: 1, explanation: 'Third person "specifies".' },
  { prompt: 'Please _____ the checklist before submitting.', choices: ['verify', 'verified', 'verifying', 'verifies'], answerIndex: 0, explanation: 'Imperative "verify".' },
  { prompt: 'The merger _____ in the first quarter.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 1, explanation: 'Past "completed".' },
  { prompt: 'We are _____ to answer your questions.', choices: ['here', 'there', 'ready', 'able'], answerIndex: 3, explanation: '"able to" is the phrase.' },
  { prompt: 'The shipment _____ from the warehouse today.', choices: ['dispatch', 'dispatched', 'dispatching', 'dispatches'], answerIndex: 1, explanation: 'Past passive sense "dispatched".' }
];

const level6Templates = [
  { prompt: 'The company has decided to _____ its operations in Asia.', choices: ['expand', 'reduce', 'maintain', 'eliminate'], answerIndex: 0, explanation: '"expand" fits the context of growing operations.' },
  { prompt: 'The proposal was _____ by the board.', choices: ['reject', 'rejected', 'rejecting', 'rejects'], answerIndex: 1, explanation: 'Passive: "was rejected".' },
  { prompt: 'We should _____ the terms before signing.', choices: ['negotiate', 'negotiated', 'negotiating', 'negotiates'], answerIndex: 0, explanation: '"should" + base form "negotiate".' },
  { prompt: 'The survey _____ that most customers are satisfied.', choices: ['indicate', 'indicates', 'indicating', 'indicated'], answerIndex: 1, explanation: 'Third person: "indicates".' },
  { prompt: 'The new policy will _____ all departments.', choices: ['affect', 'effect', 'affected', 'affecting'], answerIndex: 0, explanation: '"affect" (verb) means to influence.' },
  { prompt: 'It is _____ that we reduce costs this quarter.', choices: ['essential', 'essentially', 'essence', 'essentiality'], answerIndex: 0, explanation: '"essential" is the adjective form.' },
  { prompt: 'The manager _____ the team to meet the deadline.', choices: ['instruct', 'instructed', 'instructing', 'instructs'], answerIndex: 1, explanation: 'Past tense "instructed".' },
  { prompt: 'We are _____ a response from the vendor.', choices: ['await', 'awaiting', 'awaited', 'awaits'], answerIndex: 1, explanation: 'Present continuous: "are awaiting".' },
  { prompt: 'The data _____ a significant trend.', choices: ['reveal', 'reveals', 'revealing', 'revealed'], answerIndex: 1, explanation: 'Third person: "reveals".' },
  { prompt: 'The committee _____ the proposal last week.', choices: ['evaluate', 'evaluated', 'evaluating', 'evaluates'], answerIndex: 1, explanation: 'Past "evaluated".' },
  { prompt: 'We need to _____ the contract terms.', choices: ['clarify', 'clarified', 'clarifying', 'clarifies'], answerIndex: 0, explanation: '"need to" + base form "clarify".' },
  { prompt: 'The report _____ a decline in sales.', choices: ['document', 'documents', 'documenting', 'documented'], answerIndex: 1, explanation: 'Third person "documents".' },
  { prompt: 'All applications will be _____ in confidence.', choices: ['treat', 'treated', 'treating', 'treats'], answerIndex: 1, explanation: 'Passive "will be treated".' },
  { prompt: 'The meeting has been _____ to 3 p.m.', choices: ['move', 'moved', 'moving', 'moves'], answerIndex: 1, explanation: 'Passive "has been moved".' },
  { prompt: 'We _____ to expand into new markets.', choices: ['plan', 'planned', 'planning', 'plans'], answerIndex: 0, explanation: 'Present "plan".' },
  { prompt: 'The software _____ regular updates.', choices: ['receive', 'receives', 'receiving', 'received'], answerIndex: 1, explanation: 'Third person "receives".' },
  { prompt: 'Please _____ the draft by tomorrow.', choices: ['approve', 'approved', 'approving', 'approves'], answerIndex: 0, explanation: 'Imperative "approve".' },
  { prompt: 'The budget _____ for the project.', choices: ['allocate', 'allocated', 'allocating', 'allocates'], answerIndex: 1, explanation: 'Passive "allocated".' },
  { prompt: 'We are _____ the impact of the change.', choices: ['assess', 'assessing', 'assessed', 'assesses'], answerIndex: 1, explanation: 'Present continuous "assessing".' },
  { prompt: 'The policy _____ overtime pay.', choices: ['govern', 'governs', 'governing', 'governed'], answerIndex: 1, explanation: 'Third person "governs".' },
  { prompt: 'All expenses must be _____ in advance.', choices: ['authorize', 'authorized', 'authorizing', 'authorizes'], answerIndex: 1, explanation: 'Passive "must be authorized".' },
  { prompt: 'The team _____ the target ahead of schedule.', choices: ['achieve', 'achieved', 'achieving', 'achieves'], answerIndex: 1, explanation: 'Past "achieved".' },
  { prompt: 'We _____ your prompt payment.', choices: ['expect', 'expected', 'expecting', 'expects'], answerIndex: 0, explanation: 'Present "expect".' },
  { prompt: 'The system _____ user access by role.', choices: ['restrict', 'restricts', 'restricting', 'restricted'], answerIndex: 1, explanation: 'Third person "restricts".' },
  { prompt: 'Please _____ the document to the shared folder.', choices: ['upload', 'uploaded', 'uploading', 'uploads'], answerIndex: 0, explanation: 'Imperative "upload".' },
  { prompt: 'The agreement _____ both parties.', choices: ['oblige', 'obliges', 'obliging', 'obliged'], answerIndex: 1, explanation: 'Third person "obliges".' },
  { prompt: 'We have _____ the issue to IT support.', choices: ['assign', 'assigned', 'assigning', 'assigns'], answerIndex: 1, explanation: 'Present perfect "have assigned".' },
  { prompt: 'The fee _____ non-refundable.', choices: ['is', 'are', 'be', 'been'], answerIndex: 0, explanation: 'Linking verb "is".' },
  { prompt: 'All staff must _____ the code of conduct.', choices: ['acknowledge', 'acknowledged', 'acknowledging', 'acknowledges'], answerIndex: 0, explanation: '"must" + base form "acknowledge".' },
  { prompt: 'The project _____ significant resources.', choices: ['require', 'requires', 'requiring', 'required'], answerIndex: 1, explanation: 'Third person "requires".' },
  { prompt: 'We _____ to notify you of any delays.', choices: ['undertake', 'undertook', 'undertaking', 'undertakes'], answerIndex: 0, explanation: 'Present "undertake".' },
  { prompt: 'The deadline _____ at noon on Friday.', choices: ['expire', 'expires', 'expiring', 'expired'], answerIndex: 1, explanation: 'Scheduled "expires".' },
  { prompt: 'Please _____ your preferences in the survey.', choices: ['indicate', 'indicated', 'indicating', 'indicates'], answerIndex: 0, explanation: 'Imperative "indicate".' },
  { prompt: 'The contract _____ a 30-day notice period.', choices: ['stipulate', 'stipulates', 'stipulating', 'stipulated'], answerIndex: 1, explanation: 'Third person "stipulates".' },
  { prompt: 'We are _____ a replacement for the position.', choices: ['recruit', 'recruiting', 'recruited', 'recruits'], answerIndex: 1, explanation: 'Present continuous "recruiting".' },
  { prompt: 'The results _____ our initial forecast.', choices: ['match', 'matched', 'matching', 'matches'], answerIndex: 1, explanation: 'Past "matched".' },
  { prompt: 'All participants must _____ the consent form.', choices: ['sign', 'signed', 'signing', 'signs'], answerIndex: 0, explanation: '"must" + base form "sign".' },
  { prompt: 'The department _____ its goals for the year.', choices: ['exceed', 'exceeded', 'exceeding', 'exceeds'], answerIndex: 1, explanation: 'Past "exceeded".' },
  { prompt: 'We _____ your feedback on the draft.', choices: ['invite', 'invited', 'inviting', 'invites'], answerIndex: 0, explanation: 'Present "invite".' },
  { prompt: 'The software _____ a license key.', choices: ['require', 'requires', 'requiring', 'required'], answerIndex: 1, explanation: 'Third person "requires".' },
  { prompt: 'Please _____ the meeting notes to the team.', choices: ['distribute', 'distributed', 'distributing', 'distributes'], answerIndex: 0, explanation: 'Imperative "distribute".' },
  { prompt: 'The policy _____ immediate effect.', choices: ['have', 'has', 'having', 'had'], answerIndex: 1, explanation: 'Third person "has".' },
  { prompt: 'We have _____ the proposal to the client.', choices: ['present', 'presented', 'presenting', 'presents'], answerIndex: 1, explanation: 'Present perfect "have presented".' },
  { prompt: 'The committee _____ on the matter tomorrow.', choices: ['vote', 'votes', 'voting', 'voted'], answerIndex: 1, explanation: 'Scheduled "votes".' },
  { prompt: 'All requests are _____ in order of receipt.', choices: ['process', 'processed', 'processing', 'processes'], answerIndex: 1, explanation: 'Passive "are processed".' },
  { prompt: 'The company _____ a strong market position.', choices: ['maintain', 'maintains', 'maintaining', 'maintained'], answerIndex: 1, explanation: 'Present "maintains".' },
  { prompt: 'We _____ to complete the audit by month end.', choices: ['aim', 'aimed', 'aiming', 'aims'], answerIndex: 0, explanation: 'Present "aim".' },
  { prompt: 'The training _____ hands-on experience.', choices: ['emphasize', 'emphasizes', 'emphasizing', 'emphasized'], answerIndex: 1, explanation: 'Third person "emphasizes".' },
  { prompt: 'Please _____ the agenda to the attendees.', choices: ['email', 'emailed', 'emailing', 'emails'], answerIndex: 0, explanation: 'Imperative "email".' },
  { prompt: 'The agreement _____ renewal annually.', choices: ['allow', 'allows', 'allowing', 'allowed'], answerIndex: 1, explanation: 'Third person "allows".' },
  { prompt: 'We are _____ the schedule for next quarter.', choices: ['finalize', 'finalizing', 'finalized', 'finalizes'], answerIndex: 1, explanation: 'Present continuous "finalizing".' },
  { prompt: 'The report _____ key risk factors.', choices: ['identify', 'identifies', 'identifying', 'identified'], answerIndex: 1, explanation: 'Third person "identifies".' },
  { prompt: 'All members are _____ to vote.', choices: ['eligible', 'eligibly', 'eligibility', 'eligibles'], answerIndex: 0, explanation: 'Adjective "eligible".' },
  { prompt: 'The project _____ multiple stakeholders.', choices: ['involve', 'involves', 'involving', 'involved'], answerIndex: 1, explanation: 'Third person "involves".' },
  { prompt: 'We _____ a response within 48 hours.', choices: ['guarantee', 'guaranteed', 'guaranteeing', 'guarantees'], answerIndex: 0, explanation: 'Present "guarantee".' },
  { prompt: 'The fee _____ for early payment.', choices: ['waive', 'waived', 'waiving', 'waives'], answerIndex: 1, explanation: 'Passive "waived".' },
  { prompt: 'Please _____ the guidelines before starting.', choices: ['familiarize', 'familiarized', 'familiarizing', 'familiarizes'], answerIndex: 1, explanation: 'Reflexive "familiarize yourself".' },
  { prompt: 'The merger _____ regulatory approval.', choices: ['pending', 'pend', 'pends', 'pended'], answerIndex: 0, explanation: 'Adjective "pending".' },
  { prompt: 'We have _____ the contract for review.', choices: ['submit', 'submitted', 'submitting', 'submits'], answerIndex: 1, explanation: 'Present perfect "have submitted".' },
  { prompt: 'The survey _____ employee satisfaction.', choices: ['measure', 'measures', 'measuring', 'measured'], answerIndex: 1, explanation: 'Third person "measures".' },
  { prompt: 'All data is _____ securely.', choices: ['store', 'stored', 'storing', 'stores'], answerIndex: 1, explanation: 'Passive "is stored".' },
  { prompt: 'The initiative _____ support from management.', choices: ['enjoy', 'enjoys', 'enjoying', 'enjoyed'], answerIndex: 1, explanation: 'Third person "enjoys".' },
  { prompt: 'We _____ to improve customer service.', choices: ['strive', 'strived', 'striving', 'strives'], answerIndex: 0, explanation: 'Present "strive".' },
  { prompt: 'The deadline is _____.', choices: ['flexible', 'flexibly', 'flexibility', 'flex'], answerIndex: 0, explanation: 'Adjective "flexible".' },
  { prompt: 'Please _____ the attachment.', choices: ['find', 'found', 'finding', 'finds'], answerIndex: 0, explanation: 'Imperative "find".' },
  { prompt: 'The program _____ five modules.', choices: ['comprise', 'comprises', 'comprising', 'comprised'], answerIndex: 1, explanation: 'Third person "comprises".' },
  { prompt: 'We are _____ the new procedures.', choices: ['implement', 'implementing', 'implemented', 'implements'], answerIndex: 1, explanation: 'Present continuous "implementing".' },
  { prompt: 'The policy _____ all part-time staff.', choices: ['exclude', 'excludes', 'excluding', 'excluded'], answerIndex: 1, explanation: 'Third person "excludes".' },
  { prompt: 'All submissions are _____ by a panel.', choices: ['judge', 'judged', 'judging', 'judges'], answerIndex: 1, explanation: 'Passive "are judged".' },
  { prompt: 'The company _____ to high standards.', choices: ['adhere', 'adheres', 'adhering', 'adhered'], answerIndex: 1, explanation: 'Third person "adheres".' },
  { prompt: 'We _____ your concern and will look into it.', choices: ['understand', 'understood', 'understanding', 'understands'], answerIndex: 0, explanation: 'Present "understand".' },
  { prompt: 'The rate _____ with market conditions.', choices: ['fluctuate', 'fluctuates', 'fluctuating', 'fluctuated'], answerIndex: 1, explanation: 'Third person "fluctuates".' },
  { prompt: 'Please _____ your availability.', choices: ['indicate', 'indicated', 'indicating', 'indicates'], answerIndex: 0, explanation: 'Imperative "indicate".' },
  { prompt: 'The contract _____ both parties equally.', choices: ['bind', 'binds', 'binding', 'bound'], answerIndex: 1, explanation: 'Third person "binds".' },
  { prompt: 'We have _____ the meeting room.', choices: ['reserve', 'reserved', 'reserving', 'reserves'], answerIndex: 1, explanation: 'Present perfect "have reserved".' },
  { prompt: 'The update _____ previous versions.', choices: ['replace', 'replaces', 'replacing', 'replaced'], answerIndex: 1, explanation: 'Third person "replaces".' },
  { prompt: 'All inquiries are _____ within 24 hours.', choices: ['answer', 'answered', 'answering', 'answers'], answerIndex: 1, explanation: 'Passive "are answered".' },
  { prompt: 'The department _____ its budget.', choices: ['overspend', 'overspent', 'overspending', 'overspends'], answerIndex: 1, explanation: 'Past "overspent".' },
  { prompt: 'We _____ your cooperation.', choices: ['count on', 'counted on', 'counting on', 'counts on'], answerIndex: 0, explanation: 'Present "count on".' },
  { prompt: 'The system _____ automatic backups.', choices: ['perform', 'performs', 'performing', 'performed'], answerIndex: 1, explanation: 'Third person "performs".' },
  { prompt: 'Please _____ the instructions.', choices: ['follow', 'followed', 'following', 'follows'], answerIndex: 0, explanation: 'Imperative "follow".' },
  { prompt: 'The agreement _____ in writing.', choices: ['confirm', 'confirmed', 'confirming', 'confirms'], answerIndex: 1, explanation: 'Passive "confirmed".' },
  { prompt: 'We are _____ the feasibility of the project.', choices: ['study', 'studying', 'studied', 'studies'], answerIndex: 1, explanation: 'Present continuous "studying".' },
  { prompt: 'The fee _____ tax.', choices: ['exclude', 'excludes', 'excluding', 'excluded'], answerIndex: 1, explanation: 'Third person "excludes".' },
  { prompt: 'All employees _____ to the policy.', choices: ['subject', 'subjected', 'subjecting', 'subjects'], answerIndex: 0, explanation: '"subject to" - adjective.' },
  { prompt: 'The report _____ next Monday.', choices: ['publish', 'publishes', 'publishing', 'published'], answerIndex: 1, explanation: 'Passive "published".' },
  { prompt: 'We _____ to maintain quality.', choices: ['commit', 'committed', 'committing', 'commits'], answerIndex: 0, explanation: 'Present "commit".' },
  { prompt: 'The training _____ practical skills.', choices: ['focus on', 'focuses on', 'focusing on', 'focused on'], answerIndex: 1, explanation: 'Third person "focuses on".' },
  { prompt: 'Please _____ the form in duplicate.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 0, explanation: 'Imperative "complete".' },
  { prompt: 'The policy _____ from January 1.', choices: ['apply', 'applies', 'applying', 'applied'], answerIndex: 1, explanation: 'Third person "applies".' },
  { prompt: 'We have _____ the issue with the supplier.', choices: ['resolve', 'resolved', 'resolving', 'resolves'], answerIndex: 1, explanation: 'Present perfect "have resolved".' },
  { prompt: 'The seminar _____ registration fees.', choices: ['include', 'includes', 'including', 'included'], answerIndex: 1, explanation: 'Third person "includes".' },
  { prompt: 'All changes must be _____ in the system.', choices: ['record', 'recorded', 'recording', 'records'], answerIndex: 1, explanation: 'Passive "must be recorded".' },
  { prompt: 'The company _____ a global presence.', choices: ['establish', 'established', 'establishing', 'establishes'], answerIndex: 1, explanation: 'Past "established".' },
  { prompt: 'We _____ your continued support.', choices: ['value', 'valued', 'valuing', 'values'], answerIndex: 0, explanation: 'Present "value".' },
  { prompt: 'The software _____ user feedback.', choices: ['incorporate', 'incorporates', 'incorporating', 'incorporated'], answerIndex: 1, explanation: 'Third person "incorporates".' },
  { prompt: 'Please _____ the attachment.', choices: ['review', 'reviewed', 'reviewing', 'reviews'], answerIndex: 0, explanation: 'Imperative "review".' },
  { prompt: 'The agreement _____ termination clauses.', choices: ['contain', 'contains', 'containing', 'contained'], answerIndex: 1, explanation: 'Third person "contains".' },
  { prompt: 'We are _____ the proposal.', choices: ['refine', 'refining', 'refined', 'refines'], answerIndex: 1, explanation: 'Present continuous "refining".' },
  { prompt: 'The deadline _____ negotiable.', choices: ['is', 'are', 'be', 'been'], answerIndex: 0, explanation: 'Linking verb "is".' },
  { prompt: 'All orders _____ same-day dispatch.', choices: ['qualify for', 'qualifies for', 'qualifying for', 'qualified for'], answerIndex: 0, explanation: 'Plural "qualify for".' },
  { prompt: 'The report _____ the findings.', choices: ['summarize', 'summarizes', 'summarizing', 'summarized'], answerIndex: 1, explanation: 'Third person "summarizes".' },
  { prompt: 'We _____ to hear from you.', choices: ['look', 'looked', 'looking', 'looks'], answerIndex: 2, explanation: '"look forward to".' },
  { prompt: 'The policy _____ sick leave.', choices: ['cover', 'covers', 'covering', 'covered'], answerIndex: 1, explanation: 'Third person "covers".' },
  { prompt: 'Please _____ the document.', choices: ['print', 'printed', 'printing', 'prints'], answerIndex: 0, explanation: 'Imperative "print".' },
  { prompt: 'The meeting _____ at 9 a.m.', choices: ['convene', 'convenes', 'convening', 'convened'], answerIndex: 1, explanation: 'Scheduled "convenes".' },
  { prompt: 'We have _____ the requirements.', choices: ['update', 'updated', 'updating', 'updates'], answerIndex: 1, explanation: 'Present perfect "have updated".' },
  { prompt: 'The contract _____ a warranty period.', choices: ['include', 'includes', 'including', 'included'], answerIndex: 1, explanation: 'Third person "includes".' },
  { prompt: 'All attendees must _____ in advance.', choices: ['register', 'registered', 'registering', 'registers'], answerIndex: 0, explanation: '"must" + base form "register".' },
  { prompt: 'The department _____ its targets.', choices: ['meet', 'met', 'meeting', 'meets'], answerIndex: 1, explanation: 'Past "met".' },
  { prompt: 'We _____ your business.', choices: ['appreciate', 'appreciated', 'appreciating', 'appreciates'], answerIndex: 0, explanation: 'Present "appreciate".' },
  { prompt: 'The system _____ down for maintenance.', choices: ['go', 'went', 'going', 'goes'], answerIndex: 1, explanation: 'Past "went".' },
  { prompt: 'Please _____ the link.', choices: ['click', 'clicked', 'clicking', 'clicks'], answerIndex: 0, explanation: 'Imperative "click".' },
  { prompt: 'The fee _____ for groups of five or more.', choices: ['waive', 'waived', 'waiving', 'waives'], answerIndex: 1, explanation: 'Passive "waived".' },
  { prompt: 'We are _____ the details.', choices: ['confirm', 'confirming', 'confirmed', 'confirms'], answerIndex: 1, explanation: 'Present continuous "confirming".' },
  { prompt: 'The report _____ quarterly.', choices: ['issue', 'issued', 'issuing', 'issues'], answerIndex: 1, explanation: 'Passive "issued".' },
  { prompt: 'All responses will be _____.', choices: ['confidential', 'confidentially', 'confidence', 'confide'], answerIndex: 0, explanation: 'Adjective "confidential".' },
  { prompt: 'The company _____ sustainable practices.', choices: ['promote', 'promotes', 'promoting', 'promoted'], answerIndex: 1, explanation: 'Third person "promotes".' },
  { prompt: 'We _____ to deliver on time.', choices: ['ensure', 'ensured', 'ensuring', 'ensures'], answerIndex: 0, explanation: 'Present "ensure".' },
  { prompt: 'The training _____ next week.', choices: ['begin', 'begins', 'beginning', 'began'], answerIndex: 1, explanation: 'Scheduled "begins".' },
  { prompt: 'Please _____ the checklist.', choices: ['use', 'used', 'using', 'uses'], answerIndex: 0, explanation: 'Imperative "use".' },
  { prompt: 'The agreement _____ both sides.', choices: ['benefit', 'benefits', 'benefiting', 'benefited'], answerIndex: 1, explanation: 'Third person "benefits".' },
  { prompt: 'We have _____ the invoice.', choices: ['issue', 'issued', 'issuing', 'issues'], answerIndex: 1, explanation: 'Present perfect "have issued".' },
  { prompt: 'The policy _____ remote work.', choices: ['permit', 'permits', 'permitting', 'permitted'], answerIndex: 1, explanation: 'Third person "permits".' },
  { prompt: 'All data must be _____ encrypted.', choices: ['store', 'stored', 'storing', 'stores'], answerIndex: 1, explanation: 'Passive "must be stored".' },
  { prompt: 'The project _____ on track.', choices: ['remain', 'remains', 'remaining', 'remained'], answerIndex: 1, explanation: 'Third person "remains".' },
  { prompt: 'We _____ your input on this.', choices: ['welcome', 'welcomed', 'welcoming', 'welcomes'], answerIndex: 0, explanation: 'Present "welcome".' },
  { prompt: 'The deadline _____ extended.', choices: ['been', 'be', 'being', 'was'], answerIndex: 3, explanation: 'Past "was extended".' },
  { prompt: 'Please _____ the guidelines.', choices: ['read', 'readed', 'reading', 'reads'], answerIndex: 0, explanation: 'Imperative "read".' },
  { prompt: 'The contract _____ standard terms.', choices: ['reflect', 'reflects', 'reflecting', 'reflected'], answerIndex: 1, explanation: 'Third person "reflects".' },
  { prompt: 'We are _____ the options.', choices: ['weigh', 'weighing', 'weighed', 'weighs'], answerIndex: 1, explanation: 'Present continuous "weighing".' },
  { prompt: 'The survey _____ anonymous.', choices: ['remain', 'remains', 'remaining', 'remained'], answerIndex: 1, explanation: 'Linking "remains".' },
  { prompt: 'All inquiries _____ to the help desk.', choices: ['direct', 'directed', 'directing', 'directs'], answerIndex: 1, explanation: 'Passive "directed".' },
  { prompt: 'The company _____ a profit margin of 15%.', choices: ['target', 'targets', 'targeting', 'targeted'], answerIndex: 1, explanation: 'Third person "targets".' },
  { prompt: 'We _____ to provide the best service.', choices: ['strive', 'strived', 'striving', 'strives'], answerIndex: 0, explanation: 'Present "strive".' },
  { prompt: 'The update _____ security patches.', choices: ['include', 'includes', 'including', 'included'], answerIndex: 1, explanation: 'Third person "includes".' },
  { prompt: 'Please _____ your password.', choices: ['reset', 'reseted', 'resetting', 'resets'], answerIndex: 0, explanation: 'Imperative "reset".' },
  { prompt: 'The meeting _____ productive.', choices: ['prove', 'proved', 'proving', 'proves'], answerIndex: 1, explanation: 'Past "proved".' },
  { prompt: 'We have _____ the schedule.', choices: ['adjust', 'adjusted', 'adjusting', 'adjusts'], answerIndex: 1, explanation: 'Present perfect "have adjusted".' },
  { prompt: 'The policy _____ from next month.', choices: ['apply', 'applies', 'applying', 'applied'], answerIndex: 1, explanation: 'Third person "applies".' }
];

// Level 7–8: 上級（860） — ユニーク100問
const level7Templates = [
  { prompt: 'The manager asked the team to _____ the proposal by Friday.', choices: ['review', 'submit', 'discuss', 'approve'], answerIndex: 0, explanation: '"review" means to examine.' },
  { prompt: 'The agreement is _____ for renewal next year.', choices: ['eligible', 'eligibility', 'eligibly', 'eligibles'], answerIndex: 0, explanation: '"eligible for" is the correct phrase.' },
  { prompt: 'The report _____ several discrepancies.', choices: ['identify', 'identifies', 'identifying', 'identified'], answerIndex: 1, explanation: 'Third person: "identifies".' },
  { prompt: 'We must _____ the deadline to avoid penalties.', choices: ['meet', 'meeting', 'met', 'meets'], answerIndex: 0, explanation: '"must" + base form "meet".' },
  { prompt: 'The committee will _____ the matter next week.', choices: ['consider', 'considering', 'considered', 'considers'], answerIndex: 0, explanation: '"will" + base form "consider".' },
  { prompt: 'The findings are _____ with our initial hypothesis.', choices: ['consist', 'consistent', 'consistently', 'consistency'], answerIndex: 1, explanation: '"consistent" is the adjective.' },
  { prompt: 'The contract _____ both parties to confidentiality.', choices: ['bind', 'binds', 'binding', 'bound'], answerIndex: 1, explanation: 'Third person: "binds".' },
  { prompt: 'We have _____ to extend the offer.', choices: ['choose', 'chosen', 'choosing', 'chooses'], answerIndex: 1, explanation: 'Present perfect: "have chosen".' },
  { prompt: 'The policy _____ all full-time employees.', choices: ['apply to', 'applies to', 'applying to', 'applied to'], answerIndex: 1, explanation: 'Third person: "applies to".' },
  { prompt: 'The audit _____ several compliance issues.', choices: ['uncover', 'uncovered', 'uncovering', 'uncovers'], answerIndex: 1, explanation: 'Past "uncovered".' },
  { prompt: 'We need to _____ the scope of the project.', choices: ['define', 'defined', 'defining', 'defines'], answerIndex: 0, explanation: '"need to" + base form "define".' },
  { prompt: 'The board _____ the merger proposal.', choices: ['endorse', 'endorsed', 'endorsing', 'endorses'], answerIndex: 1, explanation: 'Past "endorsed".' },
  { prompt: 'All submissions must be _____ by the deadline.', choices: ['receive', 'received', 'receiving', 'receives'], answerIndex: 1, explanation: 'Passive "must be received".' },
  { prompt: 'The agreement _____ both parties.', choices: ['oblige', 'obliges', 'obliging', 'obliged'], answerIndex: 1, explanation: 'Third person "obliges".' },
  { prompt: 'We are _____ the contract terms.', choices: ['negotiate', 'negotiating', 'negotiated', 'negotiates'], answerIndex: 1, explanation: 'Present continuous "negotiating".' },
  { prompt: 'The policy _____ remote work options.', choices: ['facilitate', 'facilitates', 'facilitating', 'facilitated'], answerIndex: 1, explanation: 'Third person "facilitates".' },
  { prompt: 'Please _____ the appendix for details.', choices: ['consult', 'consulted', 'consulting', 'consults'], answerIndex: 0, explanation: 'Imperative "consult".' },
  { prompt: 'The report _____ a detailed analysis.', choices: ['present', 'presents', 'presenting', 'presented'], answerIndex: 1, explanation: 'Third person "presents".' },
  { prompt: 'We have _____ the issue with legal.', choices: ['escalate', 'escalated', 'escalating', 'escalates'], answerIndex: 1, explanation: 'Present perfect "have escalated".' },
  { prompt: 'The clause _____ liability.', choices: ['limit', 'limits', 'limiting', 'limited'], answerIndex: 1, explanation: 'Third person "limits".' },
  { prompt: 'All staff are _____ to complete the training.', choices: ['require', 'required', 'requiring', 'requires'], answerIndex: 1, explanation: 'Passive "are required".' },
  { prompt: 'The committee _____ the recommendation.', choices: ['accept', 'accepted', 'accepting', 'accepts'], answerIndex: 1, explanation: 'Past "accepted".' },
  { prompt: 'We _____ to finalize the agreement this week.', choices: ['expect', 'expected', 'expecting', 'expects'], answerIndex: 0, explanation: 'Present "expect".' },
  { prompt: 'The software _____ with existing systems.', choices: ['integrate', 'integrates', 'integrating', 'integrated'], answerIndex: 1, explanation: 'Third person "integrates".' },
  { prompt: 'Please _____ the document for accuracy.', choices: ['verify', 'verified', 'verifying', 'verifies'], answerIndex: 0, explanation: 'Imperative "verify".' },
  { prompt: 'The proposal _____ significant cost savings.', choices: ['demonstrate', 'demonstrates', 'demonstrating', 'demonstrated'], answerIndex: 1, explanation: 'Third person "demonstrates".' },
  { prompt: 'We are _____ the impact of the change.', choices: ['evaluate', 'evaluating', 'evaluated', 'evaluates'], answerIndex: 1, explanation: 'Present continuous "evaluating".' },
  { prompt: 'The contract _____ a penalty clause.', choices: ['include', 'includes', 'including', 'included'], answerIndex: 1, explanation: 'Third person "includes".' },
  { prompt: 'All inquiries should be _____ promptly.', choices: ['address', 'addressed', 'addressing', 'addresses'], answerIndex: 1, explanation: 'Passive "should be addressed".' },
  { prompt: 'The department _____ its quarterly targets.', choices: ['exceed', 'exceeded', 'exceeding', 'exceeds'], answerIndex: 1, explanation: 'Past "exceeded".' },
  { prompt: 'We _____ your patience during the transition.', choices: ['appreciate', 'appreciated', 'appreciating', 'appreciates'], answerIndex: 0, explanation: 'Present "appreciate".' },
  { prompt: 'The meeting _____ at 2 p.m. as scheduled.', choices: ['commence', 'commenced', 'commencing', 'commences'], answerIndex: 3, explanation: 'Present "commences".' },
  { prompt: 'Please _____ the guidelines before proceeding.', choices: ['review', 'reviewed', 'reviewing', 'reviews'], answerIndex: 0, explanation: 'Imperative "review".' },
  { prompt: 'The policy _____ all contractors.', choices: ['apply to', 'applies to', 'applying to', 'applied to'], answerIndex: 1, explanation: 'Third person "applies to".' },
  { prompt: 'We have _____ the budget allocation.', choices: ['approve', 'approved', 'approving', 'approves'], answerIndex: 1, explanation: 'Present perfect "have approved".' },
  { prompt: 'The report _____ key findings.', choices: ['highlight', 'highlights', 'highlighting', 'highlighted'], answerIndex: 1, explanation: 'Third person "highlights".' },
  { prompt: 'All changes must be _____ in writing.', choices: ['document', 'documented', 'documenting', 'documents'], answerIndex: 1, explanation: 'Passive "must be documented".' },
  { prompt: 'The company _____ a strong reputation.', choices: ['maintain', 'maintains', 'maintaining', 'maintained'], answerIndex: 1, explanation: 'Present "maintains".' },
  { prompt: 'We _____ to meet the deadline.', choices: ['commit', 'committed', 'committing', 'commits'], answerIndex: 0, explanation: 'Present "commit".' },
  { prompt: 'The system _____ automatic updates.', choices: ['schedule', 'schedules', 'scheduling', 'scheduled'], answerIndex: 1, explanation: 'Third person "schedules".' },
  { prompt: 'Please _____ the attachment.', choices: ['forward', 'forwarded', 'forwarding', 'forwards'], answerIndex: 0, explanation: 'Imperative "forward".' },
  { prompt: 'The agreement _____ in duplicate.', choices: ['execute', 'executed', 'executing', 'executes'], answerIndex: 1, explanation: 'Passive "executed".' },
  { prompt: 'We are _____ the proposal.', choices: ['refine', 'refining', 'refined', 'refines'], answerIndex: 1, explanation: 'Present continuous "refining".' },
  { prompt: 'The deadline _____ flexible.', choices: ['remain', 'remains', 'remaining', 'remained'], answerIndex: 1, explanation: 'Linking "remains".' },
  { prompt: 'All applications will be _____ fairly.', choices: ['evaluate', 'evaluated', 'evaluating', 'evaluates'], answerIndex: 1, explanation: 'Passive "will be evaluated".' },
  { prompt: 'The committee _____ on the matter yesterday.', choices: ['decide', 'decided', 'deciding', 'decides'], answerIndex: 1, explanation: 'Past "decided".' },
  { prompt: 'We _____ your feedback.', choices: ['value', 'valued', 'valuing', 'values'], answerIndex: 0, explanation: 'Present "value".' },
  { prompt: 'The policy _____ annual leave.', choices: ['govern', 'governs', 'governing', 'governed'], answerIndex: 1, explanation: 'Third person "governs".' },
  { prompt: 'Please _____ the form and return it.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 0, explanation: 'Imperative "complete".' },
  { prompt: 'The project _____ on schedule.', choices: ['proceed', 'proceeded', 'proceeding', 'proceeds'], answerIndex: 1, explanation: 'Past "proceeded".' },
  { prompt: 'We have _____ the requirements.', choices: ['update', 'updated', 'updating', 'updates'], answerIndex: 1, explanation: 'Present perfect "have updated".' },
  { prompt: 'The contract _____ both parties equally.', choices: ['bind', 'binds', 'binding', 'bound'], answerIndex: 1, explanation: 'Third person "binds".' },
  { prompt: 'All data must be _____ securely.', choices: ['store', 'stored', 'storing', 'stores'], answerIndex: 1, explanation: 'Passive "must be stored".' },
  { prompt: 'The survey _____ high satisfaction.', choices: ['reveal', 'reveals', 'revealing', 'revealed'], answerIndex: 1, explanation: 'Third person "reveals".' },
  { prompt: 'We _____ to deliver quality service.', choices: ['strive', 'strived', 'striving', 'strives'], answerIndex: 0, explanation: 'Present "strive".' },
  { prompt: 'The fee _____ for members.', choices: ['waive', 'waived', 'waiving', 'waives'], answerIndex: 1, explanation: 'Passive "waived".' },
  { prompt: 'Please _____ the instructions.', choices: ['follow', 'followed', 'following', 'follows'], answerIndex: 0, explanation: 'Imperative "follow".' },
  { prompt: 'The agreement _____ renewal options.', choices: ['provide', 'provides', 'providing', 'provided'], answerIndex: 1, explanation: 'Third person "provides".' },
  { prompt: 'We are _____ the timeline.', choices: ['adjust', 'adjusting', 'adjusted', 'adjusts'], answerIndex: 1, explanation: 'Present continuous "adjusting".' },
  { prompt: 'The report _____ next Monday.', choices: ['publish', 'publishes', 'publishing', 'published'], answerIndex: 1, explanation: 'Passive "published".' },
  { prompt: 'All staff must _____ the training.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 0, explanation: '"must" + base form "complete".' },
  { prompt: 'The company _____ sustainable practices.', choices: ['adopt', 'adopted', 'adopting', 'adopts'], answerIndex: 1, explanation: 'Past "adopted".' },
  { prompt: 'We _____ your cooperation.', choices: ['appreciate', 'appreciated', 'appreciating', 'appreciates'], answerIndex: 0, explanation: 'Present "appreciate".' },
  { prompt: 'The system _____ daily backups.', choices: ['perform', 'performs', 'performing', 'performed'], answerIndex: 1, explanation: 'Third person "performs".' },
  { prompt: 'Please _____ the checklist.', choices: ['use', 'used', 'using', 'uses'], answerIndex: 0, explanation: 'Imperative "use".' },
  { prompt: 'The policy _____ all employees.', choices: ['affect', 'affects', 'affecting', 'affected'], answerIndex: 1, explanation: 'Third person "affects".' },
  { prompt: 'We have _____ the issue.', choices: ['resolve', 'resolved', 'resolving', 'resolves'], answerIndex: 1, explanation: 'Present perfect "have resolved".' },
  { prompt: 'The contract _____ standard terms.', choices: ['contain', 'contains', 'containing', 'contained'], answerIndex: 1, explanation: 'Third person "contains".' },
  { prompt: 'All requests are _____ in order.', choices: ['process', 'processed', 'processing', 'processes'], answerIndex: 1, explanation: 'Passive "are processed".' },
  { prompt: 'The department _____ its objectives.', choices: ['achieve', 'achieved', 'achieving', 'achieves'], answerIndex: 1, explanation: 'Past "achieved".' },
  { prompt: 'We _____ to hear from you.', choices: ['look', 'looked', 'looking', 'looks'], answerIndex: 2, explanation: '"look forward to".' },
  { prompt: 'The training _____ practical skills.', choices: ['emphasize', 'emphasizes', 'emphasizing', 'emphasized'], answerIndex: 1, explanation: 'Third person "emphasizes".' },
  { prompt: 'Please _____ the document.', choices: ['sign', 'signed', 'signing', 'signs'], answerIndex: 0, explanation: 'Imperative "sign".' },
  { prompt: 'The agreement _____ both sides.', choices: ['benefit', 'benefits', 'benefiting', 'benefited'], answerIndex: 1, explanation: 'Third person "benefits".' },
  { prompt: 'We are _____ the details.', choices: ['finalize', 'finalizing', 'finalized', 'finalizes'], answerIndex: 1, explanation: 'Present continuous "finalizing".' },
  { prompt: 'The report _____ recommendations.', choices: ['include', 'includes', 'including', 'included'], answerIndex: 1, explanation: 'Third person "includes".' },
  { prompt: 'All participants must _____ in advance.', choices: ['register', 'registered', 'registering', 'registers'], answerIndex: 0, explanation: '"must" + base form "register".' },
  { prompt: 'The company _____ to high standards.', choices: ['adhere', 'adheres', 'adhering', 'adhered'], answerIndex: 1, explanation: 'Third person "adheres".' },
  { prompt: 'We _____ your understanding.', choices: ['appreciate', 'appreciated', 'appreciating', 'appreciates'], answerIndex: 0, explanation: 'Present "appreciate".' },
  { prompt: 'The fee _____ non-refundable.', choices: ['is', 'are', 'be', 'been'], answerIndex: 0, explanation: 'Linking verb "is".' },
  { prompt: 'Please _____ the link.', choices: ['click', 'clicked', 'clicking', 'clicks'], answerIndex: 0, explanation: 'Imperative "click".' },
  { prompt: 'The meeting _____ at 10 a.m.', choices: ['convene', 'convenes', 'convening', 'convened'], answerIndex: 1, explanation: 'Scheduled "convenes".' },
  { prompt: 'We have _____ the proposal.', choices: ['submit', 'submitted', 'submitting', 'submits'], answerIndex: 1, explanation: 'Present perfect "have submitted".' },
  { prompt: 'The policy _____ from next month.', choices: ['apply', 'applies', 'applying', 'applied'], answerIndex: 1, explanation: 'Third person "applies".' },
  { prompt: 'All expenses must be _____ in advance.', choices: ['approve', 'approved', 'approving', 'approves'], answerIndex: 1, explanation: 'Passive "must be approved".' },
  { prompt: 'The survey _____ positive feedback.', choices: ['receive', 'receives', 'receiving', 'received'], answerIndex: 1, explanation: 'Third person "receives".' },
  { prompt: 'We _____ to complete the project on time.', choices: ['aim', 'aimed', 'aiming', 'aims'], answerIndex: 0, explanation: 'Present "aim".' },
  { prompt: 'The contract _____ a warranty.', choices: ['offer', 'offers', 'offering', 'offered'], answerIndex: 1, explanation: 'Third person "offers".' },
  { prompt: 'Please _____ your availability.', choices: ['confirm', 'confirmed', 'confirming', 'confirms'], answerIndex: 0, explanation: 'Imperative "confirm".' },
  { prompt: 'The committee _____ the proposal.', choices: ['approve', 'approved', 'approving', 'approves'], answerIndex: 1, explanation: 'Past "approved".' },
  { prompt: 'We are _____ the schedule.', choices: ['revise', 'revising', 'revised', 'revises'], answerIndex: 1, explanation: 'Present continuous "revising".' },
  { prompt: 'The deadline _____ at noon.', choices: ['expire', 'expires', 'expiring', 'expired'], answerIndex: 1, explanation: 'Scheduled "expires".' },
  { prompt: 'All inquiries _____ within 24 hours.', choices: ['answer', 'answered', 'answering', 'answers'], answerIndex: 1, explanation: 'Passive "answered".' },
  { prompt: 'The company _____ a global network.', choices: ['operate', 'operates', 'operating', 'operated'], answerIndex: 1, explanation: 'Third person "operates".' },
  { prompt: 'We _____ your prompt response.', choices: ['anticipate', 'anticipated', 'anticipating', 'anticipates'], answerIndex: 0, explanation: 'Present "anticipate".' },
  { prompt: 'The software _____ regular updates.', choices: ['receive', 'receives', 'receiving', 'received'], answerIndex: 1, explanation: 'Third person "receives".' },
  { prompt: 'Please _____ the attachment.', choices: ['open', 'opened', 'opening', 'opens'], answerIndex: 0, explanation: 'Imperative "open".' },
  { prompt: 'The agreement _____ both parties.', choices: ['bind', 'binds', 'binding', 'bound'], answerIndex: 1, explanation: 'Third person "binds".' },
  { prompt: 'We have _____ the meeting room.', choices: ['reserve', 'reserved', 'reserving', 'reserves'], answerIndex: 1, explanation: 'Present perfect "have reserved".' },
  { prompt: 'The report _____ key metrics.', choices: ['track', 'tracks', 'tracking', 'tracked'], answerIndex: 1, explanation: 'Third person "tracks".' },
  { prompt: 'All data is _____ encrypted.', choices: ['store', 'stored', 'storing', 'stores'], answerIndex: 1, explanation: 'Passive "is stored".' },
  { prompt: 'The policy _____ all departments.', choices: ['apply to', 'applies to', 'applying to', 'applied to'], answerIndex: 1, explanation: 'Third person "applies to".' },
  { prompt: 'We _____ to improve efficiency.', choices: ['strive', 'strived', 'striving', 'strives'], answerIndex: 0, explanation: 'Present "strive".' },
  { prompt: 'The update _____ security fixes.', choices: ['include', 'includes', 'including', 'included'], answerIndex: 1, explanation: 'Third person "includes".' },
  { prompt: 'Please _____ the guidelines.', choices: ['read', 'readed', 'reading', 'reads'], answerIndex: 0, explanation: 'Imperative "read".' },
  { prompt: 'The contract _____ in January.', choices: ['expire', 'expires', 'expiring', 'expired'], answerIndex: 1, explanation: 'Scheduled "expires".' },
  { prompt: 'We are _____ the requirements.', choices: ['assess', 'assessing', 'assessed', 'assesses'], answerIndex: 1, explanation: 'Present continuous "assessing".' },
  { prompt: 'The survey _____ employee engagement.', choices: ['measure', 'measures', 'measuring', 'measured'], answerIndex: 1, explanation: 'Third person "measures".' },
  { prompt: 'All submissions must be _____ on time.', choices: ['submit', 'submitted', 'submitting', 'submits'], answerIndex: 1, explanation: 'Passive "must be submitted".' },
  { prompt: 'The department _____ its goals.', choices: ['meet', 'met', 'meeting', 'meets'], answerIndex: 1, explanation: 'Past "met".' },
  { prompt: 'We _____ your interest.', choices: ['welcome', 'welcomed', 'welcoming', 'welcomes'], answerIndex: 0, explanation: 'Present "welcome".' },
  { prompt: 'The system _____ user access.', choices: ['restrict', 'restricts', 'restricting', 'restricted'], answerIndex: 1, explanation: 'Third person "restricts".' },
  { prompt: 'Please _____ the form.', choices: ['fill', 'filled', 'filling', 'fills'], answerIndex: 0, explanation: 'Imperative "fill".' },
  { prompt: 'The agreement _____ renewal.', choices: ['allow', 'allows', 'allowing', 'allowed'], answerIndex: 1, explanation: 'Third person "allows".' },
  { prompt: 'We have _____ the invoice.', choices: ['issue', 'issued', 'issuing', 'issues'], answerIndex: 1, explanation: 'Present perfect "have issued".' },
  { prompt: 'The policy _____ overtime.', choices: ['govern', 'governs', 'governing', 'governed'], answerIndex: 1, explanation: 'Third person "governs".' },
  { prompt: 'All members are _____ to vote.', choices: ['eligible', 'eligibly', 'eligibility', 'eligibles'], answerIndex: 0, explanation: 'Adjective "eligible".' },
  { prompt: 'The project _____ multiple teams.', choices: ['involve', 'involves', 'involving', 'involved'], answerIndex: 1, explanation: 'Third person "involves".' },
  { prompt: 'We _____ a reply within 48 hours.', choices: ['guarantee', 'guaranteed', 'guaranteeing', 'guarantees'], answerIndex: 0, explanation: 'Present "guarantee".' },
  { prompt: 'The fee _____ for early payment.', choices: ['waive', 'waived', 'waiving', 'waives'], answerIndex: 1, explanation: 'Passive "waived".' },
  { prompt: 'Please _____ the document.', choices: ['review', 'reviewed', 'reviewing', 'reviews'], answerIndex: 0, explanation: 'Imperative "review".' },
  { prompt: 'The merger _____ regulatory approval.', choices: ['require', 'requires', 'requiring', 'required'], answerIndex: 1, explanation: 'Third person "requires".' },
  { prompt: 'We are _____ the proposal.', choices: ['draft', 'drafting', 'drafted', 'drafts'], answerIndex: 1, explanation: 'Present continuous "drafting".' },
  { prompt: 'The report _____ next week.', choices: ['release', 'released', 'releasing', 'releases'], answerIndex: 1, explanation: 'Passive "released".' },
  { prompt: 'All staff must _____ the policy.', choices: ['acknowledge', 'acknowledged', 'acknowledging', 'acknowledges'], answerIndex: 0, explanation: '"must" + base form "acknowledge".' },
  { prompt: 'The company _____ quality standards.', choices: ['maintain', 'maintains', 'maintaining', 'maintained'], answerIndex: 1, explanation: 'Third person "maintains".' },
  { prompt: 'We _____ to assist you.', choices: ['stand', 'stood', 'standing', 'stands'], answerIndex: 2, explanation: '"stand ready to".' },
  { prompt: 'The training _____ next month.', choices: ['begin', 'begins', 'beginning', 'began'], answerIndex: 1, explanation: 'Scheduled "begins".' },
  { prompt: 'Please _____ the checklist.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 0, explanation: 'Imperative "complete".' },
  { prompt: 'The contract _____ both parties.', choices: ['protect', 'protects', 'protecting', 'protected'], answerIndex: 1, explanation: 'Third person "protects".' },
  { prompt: 'We have _____ the deadline.', choices: ['extend', 'extended', 'extending', 'extends'], answerIndex: 1, explanation: 'Present perfect "have extended".' },
  { prompt: 'The policy _____ all staff.', choices: ['cover', 'covers', 'covering', 'covered'], answerIndex: 1, explanation: 'Third person "covers".' }
];

const level8Templates = [
  { prompt: 'The new policy will _____ affect all employees starting next month.', choices: ['directly', 'indirectly', 'partially', 'completely'], answerIndex: 0, explanation: '"directly" means in a straightforward manner.' },
  { prompt: 'The merger will _____ the company\'s market position.', choices: ['strengthen', 'strengthening', 'strengthened', 'strengthens'], answerIndex: 0, explanation: '"will" + base form "strengthen".' },
  { prompt: 'The audit revealed _____ in the accounting records.', choices: ['irregularity', 'irregularities', 'irregular', 'irregularly'], answerIndex: 1, explanation: 'Plural "irregularities" fits "revealed".' },
  { prompt: 'We need to _____ the impact before proceeding.', choices: ['assess', 'assessing', 'assessed', 'assesses'], answerIndex: 0, explanation: '"need to" + base form "assess".' },
  { prompt: 'The proposal is _____ to approval by the board.', choices: ['subject', 'subjective', 'subjected', 'subjecting'], answerIndex: 0, explanation: '"subject to" means conditional on.' },
  { prompt: 'The company _____ its quarterly results yesterday.', choices: ['release', 'released', 'releasing', 'releases'], answerIndex: 1, explanation: 'Past tense "released".' },
  { prompt: 'The discrepancy was _____ to a clerical error.', choices: ['attribute', 'attributed', 'attributing', 'attributes'], answerIndex: 1, explanation: 'Passive: "was attributed to".' },
  { prompt: 'The terms are _____ in the appendix.', choices: ['specify', 'specified', 'specifying', 'specifies'], answerIndex: 1, explanation: 'Passive meaning: "are specified".' },
  { prompt: 'The board _____ unanimously on the resolution.', choices: ['vote', 'voted', 'voting', 'votes'], answerIndex: 1, explanation: 'Past tense "voted".' },
  { prompt: 'The amendment will _____ the original agreement.', choices: ['supersede', 'supersedes', 'superseding', 'superseded'], answerIndex: 0, explanation: '"will" + base form "supersede".' },
  { prompt: 'We have _____ the matter to the committee.', choices: ['refer', 'referred', 'referring', 'refers'], answerIndex: 1, explanation: 'Present perfect "have referred".' },
  { prompt: 'The contract _____ both parties to confidentiality.', choices: ['bind', 'binds', 'binding', 'bound'], answerIndex: 1, explanation: 'Third person "binds".' },
  { prompt: 'All applications must be _____ by Friday.', choices: ['submit', 'submitted', 'submitting', 'submits'], answerIndex: 1, explanation: 'Passive "must be submitted".' },
  { prompt: 'The policy _____ all full-time staff.', choices: ['apply to', 'applies to', 'applying to', 'applied to'], answerIndex: 1, explanation: 'Third person "applies to".' },
  { prompt: 'We are _____ the feasibility study.', choices: ['conduct', 'conducting', 'conducted', 'conducts'], answerIndex: 1, explanation: 'Present continuous "conducting".' },
  { prompt: 'The report _____ several options.', choices: ['outline', 'outlines', 'outlining', 'outlined'], answerIndex: 1, explanation: 'Third person "outlines".' },
  { prompt: 'Please _____ the document for review.', choices: ['circulate', 'circulated', 'circulating', 'circulates'], answerIndex: 0, explanation: 'Imperative "circulate".' },
  { prompt: 'The agreement _____ in writing.', choices: ['confirm', 'confirmed', 'confirming', 'confirms'], answerIndex: 1, explanation: 'Passive "confirmed".' },
  { prompt: 'We _____ to maintain high standards.', choices: ['commit', 'committed', 'committing', 'commits'], answerIndex: 0, explanation: 'Present "commit".' },
  { prompt: 'The system _____ daily at midnight.', choices: ['backup', 'backups', 'backing up', 'backs up'], answerIndex: 3, explanation: 'Phrasal verb "backs up".' },
  { prompt: 'All staff are _____ to attend.', choices: ['require', 'required', 'requiring', 'requires'], answerIndex: 1, explanation: 'Passive "are required".' },
  { prompt: 'The committee _____ the proposal.', choices: ['endorse', 'endorsed', 'endorsing', 'endorses'], answerIndex: 1, explanation: 'Past "endorsed".' },
  { prompt: 'We need to _____ the timeline.', choices: ['revise', 'revised', 'revising', 'revises'], answerIndex: 0, explanation: '"need to" + base form "revise".' },
  { prompt: 'The policy _____ remote work.', choices: ['permit', 'permits', 'permitting', 'permitted'], answerIndex: 1, explanation: 'Third person "permits".' },
  { prompt: 'Please _____ the attachment.', choices: ['download', 'downloaded', 'downloading', 'downloads'], answerIndex: 0, explanation: 'Imperative "download".' },
  { prompt: 'The contract _____ standard clauses.', choices: ['contain', 'contains', 'containing', 'contained'], answerIndex: 1, explanation: 'Third person "contains".' },
  { prompt: 'We have _____ the requirements.', choices: ['clarify', 'clarified', 'clarifying', 'clarifies'], answerIndex: 1, explanation: 'Present perfect "have clarified".' },
  { prompt: 'The report _____ next month.', choices: ['publish', 'publishes', 'publishing', 'published'], answerIndex: 1, explanation: 'Passive "published".' },
  { prompt: 'All inquiries _____ promptly.', choices: ['address', 'addressed', 'addressing', 'addresses'], answerIndex: 1, explanation: 'Passive "addressed".' },
  { prompt: 'The company _____ a strong brand.', choices: ['build', 'builds', 'building', 'built'], answerIndex: 1, explanation: 'Present "builds".' },
  { prompt: 'We _____ your feedback.', choices: ['welcome', 'welcomed', 'welcoming', 'welcomes'], answerIndex: 0, explanation: 'Present "welcome".' },
  { prompt: 'The fee _____ for groups.', choices: ['reduce', 'reduced', 'reducing', 'reduces'], answerIndex: 1, explanation: 'Passive "reduced".' },
  { prompt: 'Please _____ the guidelines.', choices: ['follow', 'followed', 'following', 'follows'], answerIndex: 0, explanation: 'Imperative "follow".' },
  { prompt: 'The agreement _____ both sides.', choices: ['benefit', 'benefits', 'benefiting', 'benefited'], answerIndex: 1, explanation: 'Third person "benefits".' },
  { prompt: 'We are _____ the contract.', choices: ['draft', 'drafting', 'drafted', 'drafts'], answerIndex: 1, explanation: 'Present continuous "drafting".' },
  { prompt: 'The deadline _____ negotiable.', choices: ['is', 'are', 'be', 'been'], answerIndex: 0, explanation: 'Linking "is".' },
  { prompt: 'All changes must be _____ in the system.', choices: ['record', 'recorded', 'recording', 'records'], answerIndex: 1, explanation: 'Passive "must be recorded".' },
  { prompt: 'The department _____ its targets.', choices: ['exceed', 'exceeded', 'exceeding', 'exceeds'], answerIndex: 1, explanation: 'Past "exceeded".' },
  { prompt: 'We _____ to complete the audit.', choices: ['aim', 'aimed', 'aiming', 'aims'], answerIndex: 0, explanation: 'Present "aim".' },
  { prompt: 'The software _____ user data.', choices: ['encrypt', 'encrypts', 'encrypting', 'encrypted'], answerIndex: 1, explanation: 'Third person "encrypts".' },
  { prompt: 'Please _____ the form.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 0, explanation: 'Imperative "complete".' },
  { prompt: 'The policy _____ from January.', choices: ['apply', 'applies', 'applying', 'applied'], answerIndex: 1, explanation: 'Third person "applies".' },
  { prompt: 'We have _____ the proposal.', choices: ['accept', 'accepted', 'accepting', 'accepts'], answerIndex: 1, explanation: 'Present perfect "have accepted".' },
  { prompt: 'The meeting _____ at 9 a.m.', choices: ['start', 'starts', 'starting', 'started'], answerIndex: 1, explanation: 'Scheduled "starts".' },
  { prompt: 'All data is _____ securely.', choices: ['store', 'stored', 'storing', 'stores'], answerIndex: 1, explanation: 'Passive "is stored".' },
  { prompt: 'The company _____ to regulations.', choices: ['comply', 'complies', 'complying', 'complied'], answerIndex: 1, explanation: 'Third person "complies".' },
  { prompt: 'We _____ your cooperation.', choices: ['appreciate', 'appreciated', 'appreciating', 'appreciates'], answerIndex: 0, explanation: 'Present "appreciate".' },
  { prompt: 'The update _____ security patches.', choices: ['include', 'includes', 'including', 'included'], answerIndex: 1, explanation: 'Third person "includes".' },
  { prompt: 'Please _____ your password.', choices: ['reset', 'reseted', 'resetting', 'resets'], answerIndex: 0, explanation: 'Imperative "reset".' },
  { prompt: 'The contract _____ a 90-day notice.', choices: ['require', 'requires', 'requiring', 'required'], answerIndex: 1, explanation: 'Third person "requires".' },
  { prompt: 'We are _____ the options.', choices: ['weigh', 'weighing', 'weighed', 'weighs'], answerIndex: 1, explanation: 'Present continuous "weighing".' },
  { prompt: 'The survey _____ high satisfaction.', choices: ['show', 'shows', 'showing', 'shown'], answerIndex: 1, explanation: 'Third person "shows".' },
  { prompt: 'All orders _____ free shipping.', choices: ['qualify for', 'qualifies for', 'qualifying for', 'qualified for'], answerIndex: 0, explanation: 'Plural "qualify for".' },
  { prompt: 'The report _____ the findings.', choices: ['summarize', 'summarizes', 'summarizing', 'summarized'], answerIndex: 1, explanation: 'Third person "summarizes".' },
  { prompt: 'We _____ to hearing from you.', choices: ['look', 'looked', 'looking', 'looks'], answerIndex: 2, explanation: '"look forward to".' },
  { prompt: 'The policy _____ sick leave.', choices: ['cover', 'covers', 'covering', 'covered'], answerIndex: 1, explanation: 'Third person "covers".' },
  { prompt: 'Please _____ the document.', choices: ['print', 'printed', 'printing', 'prints'], answerIndex: 0, explanation: 'Imperative "print".' },
  { prompt: 'The merger _____ in Q2.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 1, explanation: 'Passive "completed".' },
  { prompt: 'We have _____ the schedule.', choices: ['adjust', 'adjusted', 'adjusting', 'adjusts'], answerIndex: 1, explanation: 'Present perfect "have adjusted".' },
  { prompt: 'The agreement _____ both parties.', choices: ['bind', 'binds', 'binding', 'bound'], answerIndex: 1, explanation: 'Third person "binds".' },
  { prompt: 'All responses will be _____.', choices: ['confidential', 'confidentially', 'confidence', 'confide'], answerIndex: 0, explanation: 'Adjective "confidential".' },
  { prompt: 'The company _____ innovation.', choices: ['promote', 'promotes', 'promoting', 'promoted'], answerIndex: 1, explanation: 'Third person "promotes".' },
  { prompt: 'We _____ to deliver on time.', choices: ['ensure', 'ensured', 'ensuring', 'ensures'], answerIndex: 0, explanation: 'Present "ensure".' },
  { prompt: 'The training _____ next week.', choices: ['begin', 'begins', 'beginning', 'began'], answerIndex: 1, explanation: 'Scheduled "begins".' },
  { prompt: 'Please _____ the checklist.', choices: ['use', 'used', 'using', 'uses'], answerIndex: 0, explanation: 'Imperative "use".' },
  { prompt: 'The clause _____ liability.', choices: ['limit', 'limits', 'limiting', 'limited'], answerIndex: 1, explanation: 'Third person "limits".' },
  { prompt: 'We are _____ the proposal.', choices: ['refine', 'refining', 'refined', 'refines'], answerIndex: 1, explanation: 'Present continuous "refining".' },
  { prompt: 'The fee _____ tax.', choices: ['exclude', 'excludes', 'excluding', 'excluded'], answerIndex: 1, explanation: 'Third person "excludes".' },
  { prompt: 'All employees _____ to the policy.', choices: ['subject', 'subjected', 'subjecting', 'subjects'], answerIndex: 0, explanation: '"subject to".' },
  { prompt: 'The report _____ quarterly.', choices: ['issue', 'issued', 'issuing', 'issues'], answerIndex: 1, explanation: 'Passive "issued".' },
  { prompt: 'We _____ your input.', choices: ['value', 'valued', 'valuing', 'values'], answerIndex: 0, explanation: 'Present "value".' },
  { prompt: 'The policy _____ all contractors.', choices: ['apply to', 'applies to', 'applying to', 'applied to'], answerIndex: 1, explanation: 'Third person "applies to".' },
  { prompt: 'We have _____ the invoice.', choices: ['issue', 'issued', 'issuing', 'issues'], answerIndex: 1, explanation: 'Present perfect "have issued".' },
  { prompt: 'The system _____ automatic updates.', choices: ['schedule', 'schedules', 'scheduling', 'scheduled'], answerIndex: 1, explanation: 'Third person "schedules".' },
  { prompt: 'Please _____ the link.', choices: ['click', 'clicked', 'clicking', 'clicks'], answerIndex: 0, explanation: 'Imperative "click".' },
  { prompt: 'The agreement _____ renewal options.', choices: ['provide', 'provides', 'providing', 'provided'], answerIndex: 1, explanation: 'Third person "provides".' },
  { prompt: 'We are _____ the details.', choices: ['finalize', 'finalizing', 'finalized', 'finalizes'], answerIndex: 1, explanation: 'Present continuous "finalizing".' },
  { prompt: 'The contract _____ standard terms.', choices: ['reflect', 'reflects', 'reflecting', 'reflected'], answerIndex: 1, explanation: 'Third person "reflects".' },
  { prompt: 'All requests are _____ in order.', choices: ['process', 'processed', 'processing', 'processes'], answerIndex: 1, explanation: 'Passive "are processed".' },
  { prompt: 'The department _____ its objectives.', choices: ['achieve', 'achieved', 'achieving', 'achieves'], answerIndex: 1, explanation: 'Past "achieved".' },
  { prompt: 'We _____ to assist you.', choices: ['stand', 'stood', 'standing', 'stands'], answerIndex: 2, explanation: '"stand ready to".' },
  { prompt: 'The survey _____ anonymous.', choices: ['remain', 'remains', 'remaining', 'remained'], answerIndex: 1, explanation: 'Linking "remains".' },
  { prompt: 'All inquiries _____ to the help desk.', choices: ['direct', 'directed', 'directing', 'directs'], answerIndex: 1, explanation: 'Passive "directed".' },
  { prompt: 'The company _____ a 15% margin.', choices: ['target', 'targets', 'targeting', 'targeted'], answerIndex: 1, explanation: 'Third person "targets".' },
  { prompt: 'We _____ to provide the best service.', choices: ['strive', 'strived', 'striving', 'strives'], answerIndex: 0, explanation: 'Present "strive".' },
  { prompt: 'The update _____ bug fixes.', choices: ['include', 'includes', 'including', 'included'], answerIndex: 1, explanation: 'Third person "includes".' },
  { prompt: 'Please _____ the document.', choices: ['sign', 'signed', 'signing', 'signs'], answerIndex: 0, explanation: 'Imperative "sign".' },
  { prompt: 'The meeting _____ productive.', choices: ['prove', 'proved', 'proving', 'proves'], answerIndex: 1, explanation: 'Past "proved".' },
  { prompt: 'We have _____ the requirements.', choices: ['update', 'updated', 'updating', 'updates'], answerIndex: 1, explanation: 'Present perfect "have updated".' },
  { prompt: 'The policy _____ from next month.', choices: ['apply', 'applies', 'applying', 'applied'], answerIndex: 1, explanation: 'Third person "applies".' },
  { prompt: 'All expenses must be _____ in advance.', choices: ['authorize', 'authorized', 'authorizing', 'authorizes'], answerIndex: 1, explanation: 'Passive "must be authorized".' },
  { prompt: 'The report _____ recommendations.', choices: ['contain', 'contains', 'containing', 'contained'], answerIndex: 1, explanation: 'Third person "contains".' },
  { prompt: 'We _____ your business.', choices: ['appreciate', 'appreciated', 'appreciating', 'appreciates'], answerIndex: 0, explanation: 'Present "appreciate".' },
  { prompt: 'The system _____ down for maintenance.', choices: ['go', 'went', 'going', 'goes'], answerIndex: 1, explanation: 'Past "went".' },
  { prompt: 'Please _____ the attachment.', choices: ['open', 'opened', 'opening', 'opens'], answerIndex: 0, explanation: 'Imperative "open".' },
  { prompt: 'The fee _____ for early payment.', choices: ['waive', 'waived', 'waiving', 'waives'], answerIndex: 1, explanation: 'Passive "waived".' },
  { prompt: 'We are _____ the details.', choices: ['confirm', 'confirming', 'confirmed', 'confirms'], answerIndex: 1, explanation: 'Present continuous "confirming".' },
  { prompt: 'The report _____ quarterly.', choices: ['issue', 'issued', 'issuing', 'issues'], answerIndex: 1, explanation: 'Passive "issued".' },
  { prompt: 'All responses will be _____.', choices: ['confidential', 'confidentially', 'confidence', 'confide'], answerIndex: 0, explanation: 'Adjective "confidential".' },
  { prompt: 'The company _____ sustainable practices.', choices: ['promote', 'promotes', 'promoting', 'promoted'], answerIndex: 1, explanation: 'Third person "promotes".' },
  { prompt: 'We _____ to deliver on time.', choices: ['ensure', 'ensured', 'ensuring', 'ensures'], answerIndex: 0, explanation: 'Present "ensure".' },
  { prompt: 'The training _____ next week.', choices: ['begin', 'begins', 'beginning', 'began'], answerIndex: 1, explanation: 'Scheduled "begins".' },
  { prompt: 'Please _____ the guidelines.', choices: ['read', 'readed', 'reading', 'reads'], answerIndex: 0, explanation: 'Imperative "read".' },
  { prompt: 'The agreement _____ both sides.', choices: ['benefit', 'benefits', 'benefiting', 'benefited'], answerIndex: 1, explanation: 'Third person "benefits".' },
  { prompt: 'We have _____ the meeting.', choices: ['reschedule', 'rescheduled', 'rescheduling', 'reschedules'], answerIndex: 1, explanation: 'Present perfect "have rescheduled".' },
  { prompt: 'The policy _____ all staff.', choices: ['cover', 'covers', 'covering', 'covered'], answerIndex: 1, explanation: 'Third person "covers".' },
  { prompt: 'All data must be _____ encrypted.', choices: ['store', 'stored', 'storing', 'stores'], answerIndex: 1, explanation: 'Passive "must be stored".' },
  { prompt: 'The project _____ on track.', choices: ['remain', 'remains', 'remaining', 'remained'], answerIndex: 1, explanation: 'Third person "remains".' },
  { prompt: 'We _____ your input.', choices: ['welcome', 'welcomed', 'welcoming', 'welcomes'], answerIndex: 0, explanation: 'Present "welcome".' },
  { prompt: 'The deadline _____ extended.', choices: ['been', 'be', 'being', 'was'], answerIndex: 3, explanation: 'Past "was extended".' },
  { prompt: 'Please _____ the form.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 0, explanation: 'Imperative "complete".' },
  { prompt: 'The contract _____ in January.', choices: ['expire', 'expires', 'expiring', 'expired'], answerIndex: 1, explanation: 'Scheduled "expires".' },
  { prompt: 'We are _____ the options.', choices: ['assess', 'assessing', 'assessed', 'assesses'], answerIndex: 1, explanation: 'Present continuous "assessing".' },
  { prompt: 'The survey _____ employee engagement.', choices: ['measure', 'measures', 'measuring', 'measured'], answerIndex: 1, explanation: 'Third person "measures".' },
  { prompt: 'All submissions must be _____ on time.', choices: ['submit', 'submitted', 'submitting', 'submits'], answerIndex: 1, explanation: 'Passive "must be submitted".' },
  { prompt: 'The department _____ its goals.', choices: ['meet', 'met', 'meeting', 'meets'], answerIndex: 1, explanation: 'Past "met".' },
  { prompt: 'We _____ your interest.', choices: ['welcome', 'welcomed', 'welcoming', 'welcomes'], answerIndex: 0, explanation: 'Present "welcome".' },
  { prompt: 'The system _____ user access.', choices: ['restrict', 'restricts', 'restricting', 'restricted'], answerIndex: 1, explanation: 'Third person "restricts".' },
  { prompt: 'Please _____ the guidelines.', choices: ['review', 'reviewed', 'reviewing', 'reviews'], answerIndex: 0, explanation: 'Imperative "review".' },
  { prompt: 'The agreement _____ renewal.', choices: ['allow', 'allows', 'allowing', 'allowed'], answerIndex: 1, explanation: 'Third person "allows".' },
  { prompt: 'We have _____ the invoice.', choices: ['issue', 'issued', 'issuing', 'issues'], answerIndex: 1, explanation: 'Present perfect "have issued".' },
  { prompt: 'The policy _____ overtime.', choices: ['govern', 'governs', 'governing', 'governed'], answerIndex: 1, explanation: 'Third person "governs".' },
  { prompt: 'All members are _____ to vote.', choices: ['eligible', 'eligibly', 'eligibility', 'eligibles'], answerIndex: 0, explanation: 'Adjective "eligible".' },
  { prompt: 'The project _____ multiple teams.', choices: ['involve', 'involves', 'involving', 'involved'], answerIndex: 1, explanation: 'Third person "involves".' },
  { prompt: 'We _____ a reply within 48 hours.', choices: ['guarantee', 'guaranteed', 'guaranteeing', 'guarantees'], answerIndex: 0, explanation: 'Present "guarantee".' },
  { prompt: 'The fee _____ for groups of five.', choices: ['waive', 'waived', 'waiving', 'waives'], answerIndex: 1, explanation: 'Passive "waived".' },
  { prompt: 'Please _____ the document.', choices: ['forward', 'forwarded', 'forwarding', 'forwards'], answerIndex: 0, explanation: 'Imperative "forward".' },
  { prompt: 'The merger _____ regulatory approval.', choices: ['require', 'requires', 'requiring', 'required'], answerIndex: 1, explanation: 'Third person "requires".' },
  { prompt: 'We are _____ the proposal.', choices: ['draft', 'drafting', 'drafted', 'drafts'], answerIndex: 1, explanation: 'Present continuous "drafting".' },
  { prompt: 'The report _____ next week.', choices: ['release', 'released', 'releasing', 'releases'], answerIndex: 1, explanation: 'Passive "released".' },
  { prompt: 'All staff must _____ the policy.', choices: ['acknowledge', 'acknowledged', 'acknowledging', 'acknowledges'], answerIndex: 0, explanation: '"must" + base form "acknowledge".' },
  { prompt: 'The company _____ quality standards.', choices: ['maintain', 'maintains', 'maintaining', 'maintained'], answerIndex: 1, explanation: 'Third person "maintains".' },
  { prompt: 'We _____ to assist you.', choices: ['stand', 'stood', 'standing', 'stands'], answerIndex: 2, explanation: '"stand ready to".' },
  { prompt: 'The training _____ next month.', choices: ['begin', 'begins', 'beginning', 'began'], answerIndex: 1, explanation: 'Scheduled "begins".' },
  { prompt: 'Please _____ the checklist.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 0, explanation: 'Imperative "complete".' },
  { prompt: 'The contract _____ both parties.', choices: ['protect', 'protects', 'protecting', 'protected'], answerIndex: 1, explanation: 'Third person "protects".' },
  { prompt: 'We have _____ the deadline.', choices: ['extend', 'extended', 'extending', 'extends'], answerIndex: 1, explanation: 'Present perfect "have extended".' },
  { prompt: 'The policy _____ all employees.', choices: ['cover', 'covers', 'covering', 'covered'], answerIndex: 1, explanation: 'Third person "covers".' }
];

// Level 9–10: 最上級（990） — ユニーク100問
const level9Templates = [
  { prompt: 'The company\'s profits have _____ significantly over the past quarter.', choices: ['fluctuated', 'stabilized', 'declined', 'accelerated'], answerIndex: 0, explanation: '"fluctuated" means to vary irregularly.' },
  { prompt: 'The initiative was _____ by lack of funding.', choices: ['hamper', 'hampered', 'hampering', 'hampers'], answerIndex: 1, explanation: 'Passive: "was hampered".' },
  { prompt: 'The clause _____ liability in case of breach.', choices: ['limit', 'limits', 'limiting', 'limited'], answerIndex: 1, explanation: 'Third person: "limits".' },
  { prompt: 'The agreement is _____ upon mutual consent.', choices: ['condition', 'conditional', 'conditionally', 'conditioned'], answerIndex: 1, explanation: '"conditional upon" is correct.' },
  { prompt: 'The report _____ a comprehensive analysis.', choices: ['provide', 'provides', 'providing', 'provided'], answerIndex: 1, explanation: 'Third person: "provides".' },
  { prompt: 'We must _____ the risks before investing.', choices: ['mitigate', 'mitigating', 'mitigated', 'mitigates'], answerIndex: 0, explanation: '"must" + base form "mitigate".' },
  { prompt: 'The committee _____ the proposal after lengthy discussion.', choices: ['endorse', 'endorsed', 'endorsing', 'endorses'], answerIndex: 1, explanation: 'Past tense "endorsed".' },
  { prompt: 'The amendment _____ the original contract.', choices: ['supersede', 'supersedes', 'superseding', 'superseded'], answerIndex: 1, explanation: 'Third person: "supersedes".' },
  { prompt: 'The findings are _____ to the previous study.', choices: ['compare', 'comparable', 'comparably', 'comparison'], answerIndex: 1, explanation: '"comparable" is the adjective.' },
  { prompt: 'The board _____ the merger unanimously.', choices: ['ratify', 'ratified', 'ratifying', 'ratifies'], answerIndex: 1, explanation: 'Past "ratified".' },
  { prompt: 'We have _____ the terms with legal.', choices: ['review', 'reviewed', 'reviewing', 'reviews'], answerIndex: 1, explanation: 'Present perfect "have reviewed".' },
  { prompt: 'The contract _____ both parties to secrecy.', choices: ['bind', 'binds', 'binding', 'bound'], answerIndex: 1, explanation: 'Third person "binds".' },
  { prompt: 'All applications must be _____ by noon.', choices: ['submit', 'submitted', 'submitting', 'submits'], answerIndex: 1, explanation: 'Passive "must be submitted".' },
  { prompt: 'The policy _____ all full-time staff.', choices: ['apply to', 'applies to', 'applying to', 'applied to'], answerIndex: 1, explanation: 'Third person "applies to".' },
  { prompt: 'We are _____ the due diligence.', choices: ['conduct', 'conducting', 'conducted', 'conducts'], answerIndex: 1, explanation: 'Present continuous "conducting".' },
  { prompt: 'The report _____ three scenarios.', choices: ['outline', 'outlines', 'outlining', 'outlined'], answerIndex: 1, explanation: 'Third person "outlines".' },
  { prompt: 'Please _____ the document to the board.', choices: ['circulate', 'circulated', 'circulating', 'circulates'], answerIndex: 0, explanation: 'Imperative "circulate".' },
  { prompt: 'The agreement _____ in writing.', choices: ['confirm', 'confirmed', 'confirming', 'confirms'], answerIndex: 1, explanation: 'Passive "confirmed".' },
  { prompt: 'We _____ to the highest standards.', choices: ['adhere', 'adhered', 'adhering', 'adheres'], answerIndex: 0, explanation: 'Present "adhere".' },
  { prompt: 'The system _____ automatically.', choices: ['backup', 'backups', 'backing up', 'backs up'], answerIndex: 3, explanation: 'Phrasal verb "backs up".' },
  { prompt: 'All staff are _____ to complete training.', choices: ['require', 'required', 'requiring', 'requires'], answerIndex: 1, explanation: 'Passive "are required".' },
  { prompt: 'The committee _____ the proposal.', choices: ['approve', 'approved', 'approving', 'approves'], answerIndex: 1, explanation: 'Past "approved".' },
  { prompt: 'We need to _____ the scope.', choices: ['define', 'defined', 'defining', 'defines'], answerIndex: 0, explanation: '"need to" + base form "define".' },
  { prompt: 'The policy _____ remote work.', choices: ['facilitate', 'facilitates', 'facilitating', 'facilitated'], answerIndex: 1, explanation: 'Third person "facilitates".' },
  { prompt: 'Please _____ the appendix.', choices: ['consult', 'consulted', 'consulting', 'consults'], answerIndex: 0, explanation: 'Imperative "consult".' },
  { prompt: 'The report _____ a detailed breakdown.', choices: ['present', 'presents', 'presenting', 'presented'], answerIndex: 1, explanation: 'Third person "presents".' },
  { prompt: 'We have _____ the issue to management.', choices: ['escalate', 'escalated', 'escalating', 'escalates'], answerIndex: 1, explanation: 'Present perfect "have escalated".' },
  { prompt: 'The clause _____ liability.', choices: ['cap', 'caps', 'capping', 'capped'], answerIndex: 1, explanation: 'Third person "caps".' },
  { prompt: 'All submissions must be _____ by Friday.', choices: ['receive', 'received', 'receiving', 'receives'], answerIndex: 1, explanation: 'Passive "must be received".' },
  { prompt: 'The agreement _____ both parties.', choices: ['oblige', 'obliges', 'obliging', 'obliged'], answerIndex: 1, explanation: 'Third person "obliges".' },
  { prompt: 'We are _____ the terms.', choices: ['negotiate', 'negotiating', 'negotiated', 'negotiates'], answerIndex: 1, explanation: 'Present continuous "negotiating".' },
  { prompt: 'The policy _____ flexible hours.', choices: ['permit', 'permits', 'permitting', 'permitted'], answerIndex: 1, explanation: 'Third person "permits".' },
  { prompt: 'Please _____ the attachment.', choices: ['download', 'downloaded', 'downloading', 'downloads'], answerIndex: 0, explanation: 'Imperative "download".' },
  { prompt: 'The contract _____ standard terms.', choices: ['contain', 'contains', 'containing', 'contained'], answerIndex: 1, explanation: 'Third person "contains".' },
  { prompt: 'We have _____ the requirements.', choices: ['clarify', 'clarified', 'clarifying', 'clarifies'], answerIndex: 1, explanation: 'Present perfect "have clarified".' },
  { prompt: 'The report _____ next month.', choices: ['publish', 'publishes', 'publishing', 'published'], answerIndex: 1, explanation: 'Passive "published".' },
  { prompt: 'All inquiries _____ promptly.', choices: ['address', 'addressed', 'addressing', 'addresses'], answerIndex: 1, explanation: 'Passive "addressed".' },
  { prompt: 'The company _____ a leading position.', choices: ['hold', 'holds', 'holding', 'held'], answerIndex: 1, explanation: 'Present "holds".' },
  { prompt: 'We _____ your feedback.', choices: ['welcome', 'welcomed', 'welcoming', 'welcomes'], answerIndex: 0, explanation: 'Present "welcome".' },
  { prompt: 'The fee _____ for early payment.', choices: ['reduce', 'reduced', 'reducing', 'reduces'], answerIndex: 1, explanation: 'Passive "reduced".' },
  { prompt: 'Please _____ the guidelines.', choices: ['follow', 'followed', 'following', 'follows'], answerIndex: 0, explanation: 'Imperative "follow".' },
  { prompt: 'The agreement _____ both sides.', choices: ['benefit', 'benefits', 'benefiting', 'benefited'], answerIndex: 1, explanation: 'Third person "benefits".' },
  { prompt: 'We are _____ the contract.', choices: ['draft', 'drafting', 'drafted', 'drafts'], answerIndex: 1, explanation: 'Present continuous "drafting".' },
  { prompt: 'The deadline _____ flexible.', choices: ['remain', 'remains', 'remaining', 'remained'], answerIndex: 1, explanation: 'Linking "remains".' },
  { prompt: 'All changes must be _____ in the system.', choices: ['record', 'recorded', 'recording', 'records'], answerIndex: 1, explanation: 'Passive "must be recorded".' },
  { prompt: 'The department _____ its targets.', choices: ['exceed', 'exceeded', 'exceeding', 'exceeds'], answerIndex: 1, explanation: 'Past "exceeded".' },
  { prompt: 'We _____ to complete the review.', choices: ['aim', 'aimed', 'aiming', 'aims'], answerIndex: 0, explanation: 'Present "aim".' },
  { prompt: 'The software _____ data securely.', choices: ['encrypt', 'encrypts', 'encrypting', 'encrypted'], answerIndex: 1, explanation: 'Third person "encrypts".' },
  { prompt: 'Please _____ the form.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 0, explanation: 'Imperative "complete".' },
  { prompt: 'The policy _____ from January.', choices: ['apply', 'applies', 'applying', 'applied'], answerIndex: 1, explanation: 'Third person "applies".' },
  { prompt: 'We have _____ the proposal.', choices: ['accept', 'accepted', 'accepting', 'accepts'], answerIndex: 1, explanation: 'Present perfect "have accepted".' },
  { prompt: 'The meeting _____ at 9 a.m.', choices: ['start', 'starts', 'starting', 'started'], answerIndex: 1, explanation: 'Scheduled "starts".' },
  { prompt: 'All data is _____ securely.', choices: ['store', 'stored', 'storing', 'stores'], answerIndex: 1, explanation: 'Passive "is stored".' },
  { prompt: 'The company _____ to regulations.', choices: ['comply', 'complies', 'complying', 'complied'], answerIndex: 1, explanation: 'Third person "complies".' },
  { prompt: 'We _____ your cooperation.', choices: ['appreciate', 'appreciated', 'appreciating', 'appreciates'], answerIndex: 0, explanation: 'Present "appreciate".' },
  { prompt: 'The update _____ security fixes.', choices: ['include', 'includes', 'including', 'included'], answerIndex: 1, explanation: 'Third person "includes".' },
  { prompt: 'Please _____ your password.', choices: ['reset', 'reseted', 'resetting', 'resets'], answerIndex: 0, explanation: 'Imperative "reset".' },
  { prompt: 'The contract _____ a 90-day notice.', choices: ['require', 'requires', 'requiring', 'required'], answerIndex: 1, explanation: 'Third person "requires".' },
  { prompt: 'We are _____ the options.', choices: ['weigh', 'weighing', 'weighed', 'weighs'], answerIndex: 1, explanation: 'Present continuous "weighing".' },
  { prompt: 'The survey _____ high satisfaction.', choices: ['show', 'shows', 'showing', 'shown'], answerIndex: 1, explanation: 'Third person "shows".' },
  { prompt: 'All orders _____ free shipping.', choices: ['qualify for', 'qualifies for', 'qualifying for', 'qualified for'], answerIndex: 0, explanation: 'Plural "qualify for".' },
  { prompt: 'The report _____ the findings.', choices: ['summarize', 'summarizes', 'summarizing', 'summarized'], answerIndex: 1, explanation: 'Third person "summarizes".' },
  { prompt: 'We _____ to hearing from you.', choices: ['look', 'looked', 'looking', 'looks'], answerIndex: 2, explanation: '"look forward to".' },
  { prompt: 'The policy _____ sick leave.', choices: ['cover', 'covers', 'covering', 'covered'], answerIndex: 1, explanation: 'Third person "covers".' },
  { prompt: 'Please _____ the document.', choices: ['print', 'printed', 'printing', 'prints'], answerIndex: 0, explanation: 'Imperative "print".' },
  { prompt: 'The merger _____ in Q2.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 1, explanation: 'Passive "completed".' },
  { prompt: 'We have _____ the schedule.', choices: ['adjust', 'adjusted', 'adjusting', 'adjusts'], answerIndex: 1, explanation: 'Present perfect "have adjusted".' },
  { prompt: 'The agreement _____ both parties.', choices: ['bind', 'binds', 'binding', 'bound'], answerIndex: 1, explanation: 'Third person "binds".' },
  { prompt: 'All responses will be _____.', choices: ['confidential', 'confidentially', 'confidence', 'confide'], answerIndex: 0, explanation: 'Adjective "confidential".' },
  { prompt: 'The company _____ innovation.', choices: ['promote', 'promotes', 'promoting', 'promoted'], answerIndex: 1, explanation: 'Third person "promotes".' },
  { prompt: 'We _____ to deliver on time.', choices: ['ensure', 'ensured', 'ensuring', 'ensures'], answerIndex: 0, explanation: 'Present "ensure".' },
  { prompt: 'The training _____ next week.', choices: ['begin', 'begins', 'beginning', 'began'], answerIndex: 1, explanation: 'Scheduled "begins".' },
  { prompt: 'Please _____ the checklist.', choices: ['use', 'used', 'using', 'uses'], answerIndex: 0, explanation: 'Imperative "use".' },
  { prompt: 'The clause _____ liability.', choices: ['limit', 'limits', 'limiting', 'limited'], answerIndex: 1, explanation: 'Third person "limits".' },
  { prompt: 'We are _____ the proposal.', choices: ['refine', 'refining', 'refined', 'refines'], answerIndex: 1, explanation: 'Present continuous "refining".' },
  { prompt: 'The fee _____ tax.', choices: ['exclude', 'excludes', 'excluding', 'excluded'], answerIndex: 1, explanation: 'Third person "excludes".' },
  { prompt: 'All employees _____ to the policy.', choices: ['subject', 'subjected', 'subjecting', 'subjects'], answerIndex: 0, explanation: '"subject to".' },
  { prompt: 'The report _____ quarterly.', choices: ['issue', 'issued', 'issuing', 'issues'], answerIndex: 1, explanation: 'Passive "issued".' },
  { prompt: 'We _____ your input.', choices: ['value', 'valued', 'valuing', 'values'], answerIndex: 0, explanation: 'Present "value".' },
  { prompt: 'The policy _____ all contractors.', choices: ['apply to', 'applies to', 'applying to', 'applied to'], answerIndex: 1, explanation: 'Third person "applies to".' },
  { prompt: 'We have _____ the invoice.', choices: ['issue', 'issued', 'issuing', 'issues'], answerIndex: 1, explanation: 'Present perfect "have issued".' },
  { prompt: 'The system _____ automatic updates.', choices: ['schedule', 'schedules', 'scheduling', 'scheduled'], answerIndex: 1, explanation: 'Third person "schedules".' },
  { prompt: 'Please _____ the link.', choices: ['click', 'clicked', 'clicking', 'clicks'], answerIndex: 0, explanation: 'Imperative "click".' },
  { prompt: 'The agreement _____ renewal options.', choices: ['provide', 'provides', 'providing', 'provided'], answerIndex: 1, explanation: 'Third person "provides".' },
  { prompt: 'We are _____ the details.', choices: ['finalize', 'finalizing', 'finalized', 'finalizes'], answerIndex: 1, explanation: 'Present continuous "finalizing".' },
  { prompt: 'The contract _____ standard terms.', choices: ['reflect', 'reflects', 'reflecting', 'reflected'], answerIndex: 1, explanation: 'Third person "reflects".' },
  { prompt: 'All requests are _____ in order.', choices: ['process', 'processed', 'processing', 'processes'], answerIndex: 1, explanation: 'Passive "are processed".' },
  { prompt: 'The department _____ its objectives.', choices: ['achieve', 'achieved', 'achieving', 'achieves'], answerIndex: 1, explanation: 'Past "achieved".' },
  { prompt: 'We _____ to assist you.', choices: ['stand', 'stood', 'standing', 'stands'], answerIndex: 2, explanation: '"stand ready to".' },
  { prompt: 'The survey _____ anonymous.', choices: ['remain', 'remains', 'remaining', 'remained'], answerIndex: 1, explanation: 'Linking "remains".' },
  { prompt: 'All inquiries _____ to the help desk.', choices: ['direct', 'directed', 'directing', 'directs'], answerIndex: 1, explanation: 'Passive "directed".' },
  { prompt: 'The company _____ a 15% margin.', choices: ['target', 'targets', 'targeting', 'targeted'], answerIndex: 1, explanation: 'Third person "targets".' },
  { prompt: 'We _____ to provide the best service.', choices: ['strive', 'strived', 'striving', 'strives'], answerIndex: 0, explanation: 'Present "strive".' },
  { prompt: 'The update _____ bug fixes.', choices: ['include', 'includes', 'including', 'included'], answerIndex: 1, explanation: 'Third person "includes".' },
  { prompt: 'Please _____ the document.', choices: ['sign', 'signed', 'signing', 'signs'], answerIndex: 0, explanation: 'Imperative "sign".' },
  { prompt: 'The meeting _____ productive.', choices: ['prove', 'proved', 'proving', 'proves'], answerIndex: 1, explanation: 'Past "proved".' },
  { prompt: 'We have _____ the requirements.', choices: ['update', 'updated', 'updating', 'updates'], answerIndex: 1, explanation: 'Present perfect "have updated".' },
  { prompt: 'The policy _____ from next month.', choices: ['apply', 'applies', 'applying', 'applied'], answerIndex: 1, explanation: 'Third person "applies".' },
  { prompt: 'All expenses must be _____ in advance.', choices: ['authorize', 'authorized', 'authorizing', 'authorizes'], answerIndex: 1, explanation: 'Passive "must be authorized".' },
  { prompt: 'The report _____ recommendations.', choices: ['contain', 'contains', 'containing', 'contained'], answerIndex: 1, explanation: 'Third person "contains".' },
  { prompt: 'We _____ your business.', choices: ['appreciate', 'appreciated', 'appreciating', 'appreciates'], answerIndex: 0, explanation: 'Present "appreciate".' },
  { prompt: 'The system _____ for maintenance.', choices: ['down', 'close', 'closed', 'closing'], answerIndex: 0, explanation: '"down" (adjective).' },
  { prompt: 'Please _____ the attachment.', choices: ['open', 'opened', 'opening', 'opens'], answerIndex: 0, explanation: 'Imperative "open".' },
  { prompt: 'The fee _____ for early payment.', choices: ['waive', 'waived', 'waiving', 'waives'], answerIndex: 1, explanation: 'Passive "waived".' },
  { prompt: 'We are _____ the details.', choices: ['confirm', 'confirming', 'confirmed', 'confirms'], answerIndex: 1, explanation: 'Present continuous "confirming".' },
  { prompt: 'The report _____ next week.', choices: ['release', 'released', 'releasing', 'releases'], answerIndex: 1, explanation: 'Passive "released".' },
  { prompt: 'All staff must _____ the policy.', choices: ['acknowledge', 'acknowledged', 'acknowledging', 'acknowledges'], answerIndex: 0, explanation: '"must" + base form "acknowledge".' },
  { prompt: 'The company _____ quality.', choices: ['maintain', 'maintains', 'maintaining', 'maintained'], answerIndex: 1, explanation: 'Third person "maintains".' },
  { prompt: 'We _____ to assist you.', choices: ['stand', 'stood', 'standing', 'stands'], answerIndex: 2, explanation: '"stand ready to".' },
  { prompt: 'The training _____ next month.', choices: ['begin', 'begins', 'beginning', 'began'], answerIndex: 1, explanation: 'Scheduled "begins".' },
  { prompt: 'Please _____ the guidelines.', choices: ['read', 'readed', 'reading', 'reads'], answerIndex: 0, explanation: 'Imperative "read".' },
  { prompt: 'The agreement _____ both sides.', choices: ['benefit', 'benefits', 'benefiting', 'benefited'], answerIndex: 1, explanation: 'Third person "benefits".' },
  { prompt: 'We have _____ the meeting.', choices: ['reschedule', 'rescheduled', 'rescheduling', 'reschedules'], answerIndex: 1, explanation: 'Present perfect "have rescheduled".' },
  { prompt: 'The policy _____ all staff.', choices: ['cover', 'covers', 'covering', 'covered'], answerIndex: 1, explanation: 'Third person "covers".' },
  { prompt: 'All data must be _____ encrypted.', choices: ['store', 'stored', 'storing', 'stores'], answerIndex: 1, explanation: 'Passive "must be stored".' },
  { prompt: 'The project _____ on track.', choices: ['remain', 'remains', 'remaining', 'remained'], answerIndex: 1, explanation: 'Third person "remains".' },
  { prompt: 'We _____ your input.', choices: ['welcome', 'welcomed', 'welcoming', 'welcomes'], answerIndex: 0, explanation: 'Present "welcome".' },
  { prompt: 'The deadline _____ extended.', choices: ['been', 'be', 'being', 'was'], answerIndex: 3, explanation: 'Past "was extended".' },
  { prompt: 'Please _____ the form.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 0, explanation: 'Imperative "complete".' },
  { prompt: 'The contract _____ in January.', choices: ['expire', 'expires', 'expiring', 'expired'], answerIndex: 1, explanation: 'Scheduled "expires".' },
  { prompt: 'We are _____ the options.', choices: ['assess', 'assessing', 'assessed', 'assesses'], answerIndex: 1, explanation: 'Present continuous "assessing".' },
  { prompt: 'The survey _____ engagement.', choices: ['measure', 'measures', 'measuring', 'measured'], answerIndex: 1, explanation: 'Third person "measures".' },
  { prompt: 'All submissions must be _____ on time.', choices: ['submit', 'submitted', 'submitting', 'submits'], answerIndex: 1, explanation: 'Passive "must be submitted".' },
  { prompt: 'The department _____ its goals.', choices: ['meet', 'met', 'meeting', 'meets'], answerIndex: 1, explanation: 'Past "met".' },
  { prompt: 'We _____ your interest.', choices: ['welcome', 'welcomed', 'welcoming', 'welcomes'], answerIndex: 0, explanation: 'Present "welcome".' },
  { prompt: 'The system _____ access.', choices: ['restrict', 'restricts', 'restricting', 'restricted'], answerIndex: 1, explanation: 'Third person "restricts".' },
  { prompt: 'Please _____ the guidelines.', choices: ['review', 'reviewed', 'reviewing', 'reviews'], answerIndex: 0, explanation: 'Imperative "review".' },
  { prompt: 'The agreement _____ renewal.', choices: ['allow', 'allows', 'allowing', 'allowed'], answerIndex: 1, explanation: 'Third person "allows".' },
  { prompt: 'We have _____ the invoice.', choices: ['issue', 'issued', 'issuing', 'issues'], answerIndex: 1, explanation: 'Present perfect "have issued".' },
  { prompt: 'The policy _____ overtime.', choices: ['govern', 'governs', 'governing', 'governed'], answerIndex: 1, explanation: 'Third person "governs".' },
  { prompt: 'All members are _____ to vote.', choices: ['eligible', 'eligibly', 'eligibility', 'eligibles'], answerIndex: 0, explanation: 'Adjective "eligible".' },
  { prompt: 'The project _____ multiple teams.', choices: ['involve', 'involves', 'involving', 'involved'], answerIndex: 1, explanation: 'Third person "involves".' },
  { prompt: 'We _____ a reply within 48 hours.', choices: ['guarantee', 'guaranteed', 'guaranteeing', 'guarantees'], answerIndex: 0, explanation: 'Present "guarantee".' },
  { prompt: 'The fee _____ for groups.', choices: ['waive', 'waived', 'waiving', 'waives'], answerIndex: 1, explanation: 'Passive "waived".' },
  { prompt: 'Please _____ the document.', choices: ['forward', 'forwarded', 'forwarding', 'forwards'], answerIndex: 0, explanation: 'Imperative "forward".' },
  { prompt: 'The merger _____ approval.', choices: ['require', 'requires', 'requiring', 'required'], answerIndex: 1, explanation: 'Third person "requires".' },
  { prompt: 'We are _____ the proposal.', choices: ['draft', 'drafting', 'drafted', 'drafts'], answerIndex: 1, explanation: 'Present continuous "drafting".' },
  { prompt: 'The report _____ next week.', choices: ['release', 'released', 'releasing', 'releases'], answerIndex: 1, explanation: 'Passive "released".' },
  { prompt: 'All staff must _____ the policy.', choices: ['acknowledge', 'acknowledged', 'acknowledging', 'acknowledges'], answerIndex: 0, explanation: '"must" + base form "acknowledge".' },
  { prompt: 'The company _____ standards.', choices: ['maintain', 'maintains', 'maintaining', 'maintained'], answerIndex: 1, explanation: 'Third person "maintains".' },
  { prompt: 'We _____ to assist you.', choices: ['stand', 'stood', 'standing', 'stands'], answerIndex: 2, explanation: '"stand ready to".' },
  { prompt: 'The training _____ next month.', choices: ['begin', 'begins', 'beginning', 'began'], answerIndex: 1, explanation: 'Scheduled "begins".' },
  { prompt: 'Please _____ the checklist.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 0, explanation: 'Imperative "complete".' },
  { prompt: 'The contract _____ both parties.', choices: ['protect', 'protects', 'protecting', 'protected'], answerIndex: 1, explanation: 'Third person "protects".' },
  { prompt: 'We have _____ the deadline.', choices: ['extend', 'extended', 'extending', 'extends'], answerIndex: 1, explanation: 'Present perfect "have extended".' },
  { prompt: 'The policy _____ all employees.', choices: ['cover', 'covers', 'covering', 'covered'], answerIndex: 1, explanation: 'Third person "covers".' }
];

const level10Templates = [
  { prompt: 'The board\'s decision to _____ the merger was met with skepticism by industry analysts.', choices: ['expedite', 'procrastinate', 'nullify', 'ratify'], answerIndex: 3, explanation: '"ratify" means to formally approve.' },
  { prompt: 'Despite the _____ in negotiations, both parties remained committed to reaching an agreement.', choices: ['impasse', 'consensus', 'breakthrough', 'deadline'], answerIndex: 0, explanation: '"impasse" means a situation with no progress.' },
  { prompt: 'The audit revealed several _____ in the company\'s financial reporting procedures.', choices: ['discrepancies', 'compliances', 'transparencies', 'consistencies'], answerIndex: 0, explanation: '"discrepancies" means inconsistencies.' },
  { prompt: 'The contract contains a _____ clause that limits liability.', choices: ['stringent', 'stringently', 'stringency', 'stringentness'], answerIndex: 0, explanation: '"stringent" is the adjective.' },
  { prompt: 'The company sought to _____ its assets before the takeover.', choices: ['liquidate', 'liquidation', 'liquidating', 'liquidates'], answerIndex: 0, explanation: '"sought to" + base form "liquidate".' },
  { prompt: 'The _____ of the agreement was delayed by regulatory review.', choices: ['ratification', 'ratify', 'ratified', 'ratifying'], answerIndex: 0, explanation: 'Noun "ratification" is needed as subject.' },
  { prompt: 'The arbitrator _____ a settlement between the parties.', choices: ['mediate', 'mediated', 'mediating', 'mediates'], answerIndex: 1, explanation: 'Past tense "mediated".' },
  { prompt: 'The provision is _____ to interpretation.', choices: ['ambiguous', 'ambiguously', 'ambiguity', 'ambiguousness'], answerIndex: 0, explanation: '"ambiguous" is the adjective.' },
  { prompt: 'The board _____ the CEO\'s recommendation.', choices: ['concur with', 'concurs with', 'concurring with', 'concurred with'], answerIndex: 3, explanation: 'Past tense "concurred with".' },
  { prompt: 'The _____ between the two reports was striking.', choices: ['discrepancy', 'discrepancies', 'discrepant', 'discrepantly'], answerIndex: 0, explanation: 'Singular "discrepancy" fits "was".' },
  { prompt: 'The parties _____ to binding arbitration.', choices: ['submit', 'submitted', 'submitting', 'submits'], answerIndex: 1, explanation: 'Past "submitted".' },
  { prompt: 'We need to _____ the risks before proceeding.', choices: ['mitigate', 'mitigated', 'mitigating', 'mitigates'], answerIndex: 0, explanation: '"need to" + base form "mitigate".' },
  { prompt: 'The clause _____ liability in case of breach.', choices: ['limit', 'limits', 'limiting', 'limited'], answerIndex: 1, explanation: 'Third person "limits".' },
  { prompt: 'All applications must be _____ by the deadline.', choices: ['submit', 'submitted', 'submitting', 'submits'], answerIndex: 1, explanation: 'Passive "must be submitted".' },
  { prompt: 'The policy _____ all senior staff.', choices: ['apply to', 'applies to', 'applying to', 'applied to'], answerIndex: 1, explanation: 'Third person "applies to".' },
  { prompt: 'We are _____ the due diligence.', choices: ['complete', 'completing', 'completed', 'completes'], answerIndex: 1, explanation: 'Present continuous "completing".' },
  { prompt: 'The report _____ four options.', choices: ['outline', 'outlines', 'outlining', 'outlined'], answerIndex: 1, explanation: 'Third person "outlines".' },
  { prompt: 'Please _____ the document to the committee.', choices: ['circulate', 'circulated', 'circulating', 'circulates'], answerIndex: 0, explanation: 'Imperative "circulate".' },
  { prompt: 'The agreement _____ in writing.', choices: ['confirm', 'confirmed', 'confirming', 'confirms'], answerIndex: 1, explanation: 'Passive "confirmed".' },
  { prompt: 'We _____ to the highest standards.', choices: ['adhere', 'adhered', 'adhering', 'adheres'], answerIndex: 0, explanation: 'Present "adhere".' },
  { prompt: 'The system _____ daily.', choices: ['backup', 'backups', 'backing up', 'backs up'], answerIndex: 3, explanation: 'Phrasal verb "backs up".' },
  { prompt: 'All staff are _____ to attend.', choices: ['require', 'required', 'requiring', 'requires'], answerIndex: 1, explanation: 'Passive "are required".' },
  { prompt: 'The committee _____ the proposal.', choices: ['endorse', 'endorsed', 'endorsing', 'endorses'], answerIndex: 1, explanation: 'Past "endorsed".' },
  { prompt: 'We need to _____ the scope.', choices: ['define', 'defined', 'defining', 'defines'], answerIndex: 0, explanation: '"need to" + base form "define".' },
  { prompt: 'The policy _____ flexible work.', choices: ['facilitate', 'facilitates', 'facilitating', 'facilitated'], answerIndex: 1, explanation: 'Third person "facilitates".' },
  { prompt: 'Please _____ the appendix.', choices: ['consult', 'consulted', 'consulting', 'consults'], answerIndex: 0, explanation: 'Imperative "consult".' },
  { prompt: 'The report _____ a full analysis.', choices: ['present', 'presents', 'presenting', 'presented'], answerIndex: 1, explanation: 'Third person "presents".' },
  { prompt: 'We have _____ the matter to legal.', choices: ['escalate', 'escalated', 'escalating', 'escalates'], answerIndex: 1, explanation: 'Present perfect "have escalated".' },
  { prompt: 'The clause _____ liability.', choices: ['cap', 'caps', 'capping', 'capped'], answerIndex: 1, explanation: 'Third person "caps".' },
  { prompt: 'All submissions must be _____ by Friday.', choices: ['receive', 'received', 'receiving', 'receives'], answerIndex: 1, explanation: 'Passive "must be received".' },
  { prompt: 'The agreement _____ both parties.', choices: ['oblige', 'obliges', 'obliging', 'obliged'], answerIndex: 1, explanation: 'Third person "obliges".' },
  { prompt: 'We are _____ the terms.', choices: ['negotiate', 'negotiating', 'negotiated', 'negotiates'], answerIndex: 1, explanation: 'Present continuous "negotiating".' },
  { prompt: 'The policy _____ remote work.', choices: ['permit', 'permits', 'permitting', 'permitted'], answerIndex: 1, explanation: 'Third person "permits".' },
  { prompt: 'Please _____ the attachment.', choices: ['download', 'downloaded', 'downloading', 'downloads'], answerIndex: 0, explanation: 'Imperative "download".' },
  { prompt: 'The contract _____ standard clauses.', choices: ['contain', 'contains', 'containing', 'contained'], answerIndex: 1, explanation: 'Third person "contains".' },
  { prompt: 'We have _____ the requirements.', choices: ['clarify', 'clarified', 'clarifying', 'clarifies'], answerIndex: 1, explanation: 'Present perfect "have clarified".' },
  { prompt: 'The report _____ next month.', choices: ['publish', 'publishes', 'publishing', 'published'], answerIndex: 1, explanation: 'Passive "published".' },
  { prompt: 'All inquiries _____ promptly.', choices: ['address', 'addressed', 'addressing', 'addresses'], answerIndex: 1, explanation: 'Passive "addressed".' },
  { prompt: 'The company _____ a dominant position.', choices: ['hold', 'holds', 'holding', 'held'], answerIndex: 1, explanation: 'Present "holds".' },
  { prompt: 'We _____ your feedback.', choices: ['welcome', 'welcomed', 'welcoming', 'welcomes'], answerIndex: 0, explanation: 'Present "welcome".' },
  { prompt: 'The fee _____ for early payment.', choices: ['reduce', 'reduced', 'reducing', 'reduces'], answerIndex: 1, explanation: 'Passive "reduced".' },
  { prompt: 'Please _____ the guidelines.', choices: ['follow', 'followed', 'following', 'follows'], answerIndex: 0, explanation: 'Imperative "follow".' },
  { prompt: 'The agreement _____ both sides.', choices: ['benefit', 'benefits', 'benefiting', 'benefited'], answerIndex: 1, explanation: 'Third person "benefits".' },
  { prompt: 'We are _____ the contract.', choices: ['draft', 'drafting', 'drafted', 'drafts'], answerIndex: 1, explanation: 'Present continuous "drafting".' },
  { prompt: 'The deadline _____ flexible.', choices: ['remain', 'remains', 'remaining', 'remained'], answerIndex: 1, explanation: 'Linking "remains".' },
  { prompt: 'All changes must be _____ in the system.', choices: ['record', 'recorded', 'recording', 'records'], answerIndex: 1, explanation: 'Passive "must be recorded".' },
  { prompt: 'The department _____ its targets.', choices: ['exceed', 'exceeded', 'exceeding', 'exceeds'], answerIndex: 1, explanation: 'Past "exceeded".' },
  { prompt: 'We _____ to complete the audit.', choices: ['aim', 'aimed', 'aiming', 'aims'], answerIndex: 0, explanation: 'Present "aim".' },
  { prompt: 'The software _____ data.', choices: ['encrypt', 'encrypts', 'encrypting', 'encrypted'], answerIndex: 1, explanation: 'Third person "encrypts".' },
  { prompt: 'Please _____ the form.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 0, explanation: 'Imperative "complete".' },
  { prompt: 'The policy _____ from January.', choices: ['apply', 'applies', 'applying', 'applied'], answerIndex: 1, explanation: 'Third person "applies".' },
  { prompt: 'We have _____ the proposal.', choices: ['accept', 'accepted', 'accepting', 'accepts'], answerIndex: 1, explanation: 'Present perfect "have accepted".' },
  { prompt: 'The meeting _____ at 9 a.m.', choices: ['start', 'starts', 'starting', 'started'], answerIndex: 1, explanation: 'Scheduled "starts".' },
  { prompt: 'All data is _____ securely.', choices: ['store', 'stored', 'storing', 'stores'], answerIndex: 1, explanation: 'Passive "is stored".' },
  { prompt: 'The company _____ to regulations.', choices: ['comply', 'complies', 'complying', 'complied'], answerIndex: 1, explanation: 'Third person "complies".' },
  { prompt: 'We _____ your cooperation.', choices: ['appreciate', 'appreciated', 'appreciating', 'appreciates'], answerIndex: 0, explanation: 'Present "appreciate".' },
  { prompt: 'The update _____ security patches.', choices: ['include', 'includes', 'including', 'included'], answerIndex: 1, explanation: 'Third person "includes".' },
  { prompt: 'Please _____ your password.', choices: ['reset', 'reseted', 'resetting', 'resets'], answerIndex: 0, explanation: 'Imperative "reset".' },
  { prompt: 'The contract _____ a 90-day notice.', choices: ['require', 'requires', 'requiring', 'required'], answerIndex: 1, explanation: 'Third person "requires".' },
  { prompt: 'We are _____ the options.', choices: ['weigh', 'weighing', 'weighed', 'weighs'], answerIndex: 1, explanation: 'Present continuous "weighing".' },
  { prompt: 'The survey _____ satisfaction.', choices: ['show', 'shows', 'showing', 'shown'], answerIndex: 1, explanation: 'Third person "shows".' },
  { prompt: 'All orders _____ free shipping.', choices: ['qualify for', 'qualifies for', 'qualifying for', 'qualified for'], answerIndex: 0, explanation: 'Plural "qualify for".' },
  { prompt: 'The report _____ the findings.', choices: ['summarize', 'summarizes', 'summarizing', 'summarized'], answerIndex: 1, explanation: 'Third person "summarizes".' },
  { prompt: 'We _____ to hearing from you.', choices: ['look', 'looked', 'looking', 'looks'], answerIndex: 2, explanation: '"look forward to".' },
  { prompt: 'The policy _____ leave.', choices: ['cover', 'covers', 'covering', 'covered'], answerIndex: 1, explanation: 'Third person "covers".' },
  { prompt: 'Please _____ the document.', choices: ['print', 'printed', 'printing', 'prints'], answerIndex: 0, explanation: 'Imperative "print".' },
  { prompt: 'The merger _____ in Q2.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 1, explanation: 'Passive "completed".' },
  { prompt: 'We have _____ the schedule.', choices: ['adjust', 'adjusted', 'adjusting', 'adjusts'], answerIndex: 1, explanation: 'Present perfect "have adjusted".' },
  { prompt: 'The agreement _____ both parties.', choices: ['bind', 'binds', 'binding', 'bound'], answerIndex: 1, explanation: 'Third person "binds".' },
  { prompt: 'All responses will be _____.', choices: ['confidential', 'confidentially', 'confidence', 'confide'], answerIndex: 0, explanation: 'Adjective "confidential".' },
  { prompt: 'The company _____ innovation.', choices: ['promote', 'promotes', 'promoting', 'promoted'], answerIndex: 1, explanation: 'Third person "promotes".' },
  { prompt: 'We _____ to deliver on time.', choices: ['ensure', 'ensured', 'ensuring', 'ensures'], answerIndex: 0, explanation: 'Present "ensure".' },
  { prompt: 'The training _____ next week.', choices: ['begin', 'begins', 'beginning', 'began'], answerIndex: 1, explanation: 'Scheduled "begins".' },
  { prompt: 'Please _____ the checklist.', choices: ['use', 'used', 'using', 'uses'], answerIndex: 0, explanation: 'Imperative "use".' },
  { prompt: 'The clause _____ liability.', choices: ['limit', 'limits', 'limiting', 'limited'], answerIndex: 1, explanation: 'Third person "limits".' },
  { prompt: 'We are _____ the proposal.', choices: ['refine', 'refining', 'refined', 'refines'], answerIndex: 1, explanation: 'Present continuous "refining".' },
  { prompt: 'The fee _____ tax.', choices: ['exclude', 'excludes', 'excluding', 'excluded'], answerIndex: 1, explanation: 'Third person "excludes".' },
  { prompt: 'All employees _____ to the policy.', choices: ['subject', 'subjected', 'subjecting', 'subjects'], answerIndex: 0, explanation: '"subject to".' },
  { prompt: 'The report _____ quarterly.', choices: ['issue', 'issued', 'issuing', 'issues'], answerIndex: 1, explanation: 'Passive "issued".' },
  { prompt: 'We _____ your input.', choices: ['value', 'valued', 'valuing', 'values'], answerIndex: 0, explanation: 'Present "value".' },
  { prompt: 'The policy _____ all contractors.', choices: ['apply to', 'applies to', 'applying to', 'applied to'], answerIndex: 1, explanation: 'Third person "applies to".' },
  { prompt: 'We have _____ the invoice.', choices: ['issue', 'issued', 'issuing', 'issues'], answerIndex: 1, explanation: 'Present perfect "have issued".' },
  { prompt: 'The system _____ updates.', choices: ['schedule', 'schedules', 'scheduling', 'scheduled'], answerIndex: 1, explanation: 'Third person "schedules".' },
  { prompt: 'Please _____ the link.', choices: ['click', 'clicked', 'clicking', 'clicks'], answerIndex: 0, explanation: 'Imperative "click".' },
  { prompt: 'The agreement _____ renewal.', choices: ['provide', 'provides', 'providing', 'provided'], answerIndex: 1, explanation: 'Third person "provides".' },
  { prompt: 'We are _____ the details.', choices: ['finalize', 'finalizing', 'finalized', 'finalizes'], answerIndex: 1, explanation: 'Present continuous "finalizing".' },
  { prompt: 'The contract _____ standard terms.', choices: ['reflect', 'reflects', 'reflecting', 'reflected'], answerIndex: 1, explanation: 'Third person "reflects".' },
  { prompt: 'All requests are _____ in order.', choices: ['process', 'processed', 'processing', 'processes'], answerIndex: 1, explanation: 'Passive "are processed".' },
  { prompt: 'The department _____ its objectives.', choices: ['achieve', 'achieved', 'achieving', 'achieves'], answerIndex: 1, explanation: 'Past "achieved".' },
  { prompt: 'We _____ to assist you.', choices: ['stand', 'stood', 'standing', 'stands'], answerIndex: 2, explanation: '"stand ready to".' },
  { prompt: 'The survey _____ anonymous.', choices: ['remain', 'remains', 'remaining', 'remained'], answerIndex: 1, explanation: 'Linking "remains".' },
  { prompt: 'All inquiries _____ to the help desk.', choices: ['direct', 'directed', 'directing', 'directs'], answerIndex: 1, explanation: 'Passive "directed".' },
  { prompt: 'The company _____ a 20% margin.', choices: ['target', 'targets', 'targeting', 'targeted'], answerIndex: 1, explanation: 'Third person "targets".' },
  { prompt: 'We _____ to provide the best service.', choices: ['strive', 'strived', 'striving', 'strives'], answerIndex: 0, explanation: 'Present "strive".' },
  { prompt: 'The update _____ fixes.', choices: ['include', 'includes', 'including', 'included'], answerIndex: 1, explanation: 'Third person "includes".' },
  { prompt: 'Please _____ the document.', choices: ['sign', 'signed', 'signing', 'signs'], answerIndex: 0, explanation: 'Imperative "sign".' },
  { prompt: 'The meeting _____ productive.', choices: ['prove', 'proved', 'proving', 'proves'], answerIndex: 1, explanation: 'Past "proved".' },
  { prompt: 'We have _____ the requirements.', choices: ['update', 'updated', 'updating', 'updates'], answerIndex: 1, explanation: 'Present perfect "have updated".' },
  { prompt: 'The policy _____ from next month.', choices: ['apply', 'applies', 'applying', 'applied'], answerIndex: 1, explanation: 'Third person "applies".' },
  { prompt: 'All expenses must be _____ in advance.', choices: ['authorize', 'authorized', 'authorizing', 'authorizes'], answerIndex: 1, explanation: 'Passive "must be authorized".' },
  { prompt: 'The report _____ recommendations.', choices: ['contain', 'contains', 'containing', 'contained'], answerIndex: 1, explanation: 'Third person "contains".' },
  { prompt: 'We _____ your business.', choices: ['appreciate', 'appreciated', 'appreciating', 'appreciates'], answerIndex: 0, explanation: 'Present "appreciate".' },
  { prompt: 'The system _____ for maintenance.', choices: ['down', 'close', 'closed', 'closing'], answerIndex: 0, explanation: '"down".' },
  { prompt: 'Please _____ the attachment.', choices: ['open', 'opened', 'opening', 'opens'], answerIndex: 0, explanation: 'Imperative "open".' },
  { prompt: 'The fee _____ for early payment.', choices: ['waive', 'waived', 'waiving', 'waives'], answerIndex: 1, explanation: 'Passive "waived".' },
  { prompt: 'We are _____ the details.', choices: ['confirm', 'confirming', 'confirmed', 'confirms'], answerIndex: 1, explanation: 'Present continuous "confirming".' },
  { prompt: 'The report _____ next week.', choices: ['release', 'released', 'releasing', 'releases'], answerIndex: 1, explanation: 'Passive "released".' },
  { prompt: 'All staff must _____ the policy.', choices: ['acknowledge', 'acknowledged', 'acknowledging', 'acknowledges'], answerIndex: 0, explanation: '"must" + base form "acknowledge".' },
  { prompt: 'The company _____ quality.', choices: ['maintain', 'maintains', 'maintaining', 'maintained'], answerIndex: 1, explanation: 'Third person "maintains".' },
  { prompt: 'We _____ to assist you.', choices: ['stand', 'stood', 'standing', 'stands'], answerIndex: 2, explanation: '"stand ready to".' },
  { prompt: 'The training _____ next month.', choices: ['begin', 'begins', 'beginning', 'began'], answerIndex: 1, explanation: 'Scheduled "begins".' },
  { prompt: 'Please _____ the guidelines.', choices: ['read', 'readed', 'reading', 'reads'], answerIndex: 0, explanation: 'Imperative "read".' },
  { prompt: 'The agreement _____ both sides.', choices: ['benefit', 'benefits', 'benefiting', 'benefited'], answerIndex: 1, explanation: 'Third person "benefits".' },
  { prompt: 'We have _____ the meeting.', choices: ['reschedule', 'rescheduled', 'rescheduling', 'reschedules'], answerIndex: 1, explanation: 'Present perfect "have rescheduled".' },
  { prompt: 'The policy _____ all staff.', choices: ['cover', 'covers', 'covering', 'covered'], answerIndex: 1, explanation: 'Third person "covers".' },
  { prompt: 'All data must be _____ encrypted.', choices: ['store', 'stored', 'storing', 'stores'], answerIndex: 1, explanation: 'Passive "must be stored".' },
  { prompt: 'The project _____ on track.', choices: ['remain', 'remains', 'remaining', 'remained'], answerIndex: 1, explanation: 'Third person "remains".' },
  { prompt: 'We _____ your input.', choices: ['welcome', 'welcomed', 'welcoming', 'welcomes'], answerIndex: 0, explanation: 'Present "welcome".' },
  { prompt: 'The deadline _____ extended.', choices: ['been', 'be', 'being', 'was'], answerIndex: 3, explanation: 'Past "was extended".' },
  { prompt: 'Please _____ the form.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 0, explanation: 'Imperative "complete".' },
  { prompt: 'The contract _____ in January.', choices: ['expire', 'expires', 'expiring', 'expired'], answerIndex: 1, explanation: 'Scheduled "expires".' },
  { prompt: 'We are _____ the options.', choices: ['assess', 'assessing', 'assessed', 'assesses'], answerIndex: 1, explanation: 'Present continuous "assessing".' },
  { prompt: 'The survey _____ engagement.', choices: ['measure', 'measures', 'measuring', 'measured'], answerIndex: 1, explanation: 'Third person "measures".' },
  { prompt: 'All submissions must be _____ on time.', choices: ['submit', 'submitted', 'submitting', 'submits'], answerIndex: 1, explanation: 'Passive "must be submitted".' },
  { prompt: 'The department _____ its goals.', choices: ['meet', 'met', 'meeting', 'meets'], answerIndex: 1, explanation: 'Past "met".' },
  { prompt: 'We _____ your interest.', choices: ['welcome', 'welcomed', 'welcoming', 'welcomes'], answerIndex: 0, explanation: 'Present "welcome".' },
  { prompt: 'The system _____ access.', choices: ['restrict', 'restricts', 'restricting', 'restricted'], answerIndex: 1, explanation: 'Third person "restricts".' },
  { prompt: 'Please _____ the guidelines.', choices: ['review', 'reviewed', 'reviewing', 'reviews'], answerIndex: 0, explanation: 'Imperative "review".' },
  { prompt: 'The agreement _____ renewal.', choices: ['allow', 'allows', 'allowing', 'allowed'], answerIndex: 1, explanation: 'Third person "allows".' },
  { prompt: 'We have _____ the invoice.', choices: ['issue', 'issued', 'issuing', 'issues'], answerIndex: 1, explanation: 'Present perfect "have issued".' },
  { prompt: 'The policy _____ overtime.', choices: ['govern', 'governs', 'governing', 'governed'], answerIndex: 1, explanation: 'Third person "governs".' },
  { prompt: 'All members are _____ to vote.', choices: ['eligible', 'eligibly', 'eligibility', 'eligibles'], answerIndex: 0, explanation: 'Adjective "eligible".' },
  { prompt: 'The project _____ multiple teams.', choices: ['involve', 'involves', 'involving', 'involved'], answerIndex: 1, explanation: 'Third person "involves".' },
  { prompt: 'We _____ a reply within 48 hours.', choices: ['guarantee', 'guaranteed', 'guaranteeing', 'guarantees'], answerIndex: 0, explanation: 'Present "guarantee".' },
  { prompt: 'The fee _____ for groups.', choices: ['waive', 'waived', 'waiving', 'waives'], answerIndex: 1, explanation: 'Passive "waived".' },
  { prompt: 'Please _____ the document.', choices: ['forward', 'forwarded', 'forwarding', 'forwards'], answerIndex: 0, explanation: 'Imperative "forward".' },
  { prompt: 'The merger _____ approval.', choices: ['require', 'requires', 'requiring', 'required'], answerIndex: 1, explanation: 'Third person "requires".' },
  { prompt: 'We are _____ the proposal.', choices: ['draft', 'drafting', 'drafted', 'drafts'], answerIndex: 1, explanation: 'Present continuous "drafting".' },
  { prompt: 'The report _____ next week.', choices: ['release', 'released', 'releasing', 'releases'], answerIndex: 1, explanation: 'Passive "released".' },
  { prompt: 'All staff must _____ the policy.', choices: ['acknowledge', 'acknowledged', 'acknowledging', 'acknowledges'], answerIndex: 0, explanation: '"must" + base form "acknowledge".' },
  { prompt: 'The company _____ standards.', choices: ['maintain', 'maintains', 'maintaining', 'maintained'], answerIndex: 1, explanation: 'Third person "maintains".' },
  { prompt: 'We _____ to assist you.', choices: ['stand', 'stood', 'standing', 'stands'], answerIndex: 2, explanation: '"stand ready to".' },
  { prompt: 'The training _____ next month.', choices: ['begin', 'begins', 'beginning', 'began'], answerIndex: 1, explanation: 'Scheduled "begins".' },
  { prompt: 'Please _____ the checklist.', choices: ['complete', 'completed', 'completing', 'completes'], answerIndex: 0, explanation: 'Imperative "complete".' },
  { prompt: 'The contract _____ both parties.', choices: ['protect', 'protects', 'protecting', 'protected'], answerIndex: 1, explanation: 'Third person "protects".' },
  { prompt: 'We have _____ the deadline.', choices: ['extend', 'extended', 'extending', 'extends'], answerIndex: 1, explanation: 'Present perfect "have extended".' },
  { prompt: 'The policy _____ all employees.', choices: ['cover', 'covers', 'covering', 'covered'], answerIndex: 1, explanation: 'Third person "covers".' }
];

/** 配列をシャッフル（各レベルでテンプレートの偏りを防ぎ、語彙が均等に含まれるようにする） */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function takePerLevel(expanded, level, n) {
  const filtered = expanded.filter(q => q.level === level);
  return shuffle(filtered).slice(0, n);
}

/** 1テンプレートだけ展開（A2用の「テンプレあたり上限」で使う） */
function expandTemplateSingle(level, template) {
  return expandTemplates(level, [template]);
}

/** レベル1・2: テンプレートあたり最大MAX問に制限して展開し、語彙重複を下げる */
function expandTemplatesA2(level, templates, maxPerTemplate) {
  const out = [];
  for (const t of templates) {
    const expanded = expandTemplateSingle(level, t);
    const taken = shuffle(expanded).slice(0, maxPerTemplate);
    out.push(...taken);
  }
  return shuffle(out).slice(0, QUESTIONS_PER_LEVEL);
}

const LEVEL_ARRAYS = [
  level1Templates,
  level2Templates,
  level3Templates,
  level4Templates,
  level5Templates,
  level6Templates,
  level7Templates,
  level8Templates,
  level9Templates,
  level10Templates
];

/** template-levels.json を読み込む（存在しなければ null） */
function loadTemplateLevelOverlay() {
  try {
    const jsonPath = path.join(__dirname, 'template-levels.json');
    if (fs.existsSync(jsonPath)) {
      const raw = fs.readFileSync(jsonPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (_) {}
  return null;
}

/** 実効レベル別にテンプレートをグループ化。overlay がなければ従来どおりレベル＝配列インデックス+1 */
function getTemplatesByEffectiveLevel() {
  const overlay = loadTemplateLevelOverlay();
  const byLevel = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [], 10: [] };
  for (let L = 1; L <= 10; L++) {
    const templates = LEVEL_ARRAYS[L - 1];
    for (let i = 0; i < templates.length; i++) {
      const effectiveLevel = overlay ? (overlay[`${L}-${i}`] ?? L) : L;
      byLevel[effectiveLevel].push(templates[i]);
    }
  }
  return byLevel;
}

function buildAllQuestions() {
  const byEffectiveLevel = getTemplatesByEffectiveLevel();
  const byLevel = [];
  for (let level = 1; level <= 10; level++) {
    const templates = byEffectiveLevel[level];
    let questions;
    if (level === 1 || level === 2) {
      questions = expandTemplatesA2(level, templates, MAX_QUESTIONS_PER_TEMPLATE_A2);
    } else {
      const expanded = expandTemplates(level, templates);
      questions = takePerLevel(expanded, level, QUESTIONS_PER_LEVEL);
    }
    byLevel.push(...questions);
  }
  return byLevel;
}

module.exports = {
  QUESTIONS_PER_LEVEL,
  buildAllQuestions,
  expandTemplates,
  level1Templates,
  level2Templates,
  level3Templates,
  level4Templates,
  level5Templates,
  level6Templates,
  level7Templates,
  level8Templates,
  level9Templates,
  level10Templates
};
