/* ============================================================
   ATLAS IELTS Academy — Vocab X-Ray engine

   Powers the futuristic "Vocab X-Ray" toggle in Reading and
   Writing: highlights EVERY occurrence of each vocabulary word
   or phrase (not just the first, unlike §4.2's study highlights),
   resolves overlaps longest-match-first, and ships a built-in
   academic dictionary so Writing prompts and Band 9 model
   answers get highlighted too (Writing has no per-day vocab list).
   ============================================================ */

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ── Built-in academic dictionary (Writing) ──────────────────
   High-value Academic IELTS vocabulary + essay linkers, each
   with a plain-English meaning, a natural example sentence and
   a related word — the same shape the AI-generated reading
   vocab uses, so one renderer serves both modules. */
export const ACADEMIC_VOCAB = [
  { word: 'significant', definition: 'large or important enough to matter', example: 'Social media has had a significant impact on how teenagers communicate.', related: 'substantial' },
  { word: 'substantial', definition: 'large in amount or degree', example: 'There was a substantial rise in house prices last year.', related: 'considerable' },
  { word: 'considerable', definition: 'large enough to be worth noticing', example: 'The project required a considerable amount of time and money.', related: 'sizeable' },
  { word: 'dramatic', definition: 'sudden, very big and easy to notice', example: 'The city saw a dramatic increase in tourist numbers.', related: 'striking' },
  { word: 'gradual', definition: 'happening slowly, step by step', example: 'There has been a gradual shift towards renewable energy.', related: 'steady' },
  { word: 'steady', definition: 'continuing at the same rate, without sudden change', example: 'Demand for electric cars grew at a steady pace.', related: 'consistent' },
  { word: 'sharp', definition: 'sudden and very large', example: 'The new tax caused a sharp fall in car sales.', related: 'steep' },
  { word: 'slight', definition: 'very small in size or degree', example: 'There was only a slight improvement in air quality.', related: 'marginal' },
  { word: 'decline', definition: 'to become lower in number or quality', example: 'Print newspaper sales continue to decline every year.', related: 'decrease' },
  { word: 'surge', definition: 'a sudden large increase', example: 'Online shopping saw a surge during the holiday season.', related: 'spike' },
  { word: 'fluctuate', definition: 'to keep changing up and down', example: 'Fuel prices fluctuate depending on global markets.', related: 'vary' },
  { word: 'plateau', definition: 'to stop rising after a period of growth', example: 'Sales rose quickly, then plateaued at around 40,000 a month.', related: 'level off' },
  { word: 'exceed', definition: 'to go above or beyond a number or limit', example: 'This year’s profits exceeded all expectations.', related: 'surpass' },
  { word: 'comprise', definition: 'to be made up of certain parts', example: 'The survey comprised 2,000 adults from five cities.', related: 'consist of' },
  { word: 'constitute', definition: 'to form or make up something', example: 'Women constitute the majority of university students.', related: 'account for' },
  { word: 'account for', definition: 'to form a particular amount or part of something', example: 'Renewables now account for a third of total electricity.', related: 'represent' },
  { word: 'derive', definition: 'to get something from a source', example: 'The town derives most of its income from tourism.', related: 'obtain' },
  { word: 'foster', definition: 'to help something develop and grow', example: 'Group projects foster cooperation between students.', related: 'encourage' },
  { word: 'hinder', definition: 'to make it harder for something to progress', example: 'Poor transport links hinder the city’s economic growth.', related: 'obstruct' },
  { word: 'mitigate', definition: 'to make something bad less severe', example: 'Planting trees can mitigate the effects of air pollution.', related: 'reduce' },
  { word: 'exacerbate', definition: 'to make a bad situation worse', example: 'Rapid urbanisation can exacerbate traffic congestion.', related: 'worsen' },
  { word: 'alleviate', definition: 'to make pain or a problem less severe', example: 'New housing policies aim to alleviate the shortage.', related: 'ease' },
  { word: 'facilitate', definition: 'to make an action or process easier', example: 'The new app facilitates communication between teachers and parents.', related: 'enable' },
  { word: 'undermine', definition: 'to weaken something gradually', example: 'Misinformation can undermine public trust in science.', related: 'weaken' },
  { word: 'accelerate', definition: 'to happen or move faster', example: 'Automation has accelerated the pace of change in the workplace.', related: 'speed up' },
  { word: 'diminish', definition: 'to become or make smaller or less', example: 'Remote work has diminished the importance of city-centre offices.', related: 'reduce' },
  { word: 'advocate', definition: 'to publicly support an idea or policy', example: 'Many experts advocate teaching coding in primary schools.', related: 'support' },
  { word: 'scrutinise', definition: 'to examine something very carefully', example: 'Regulators scrutinise every detail of the merger.', related: 'examine' },
  { word: 'encompass', definition: 'to include a wide range of things', example: 'The course encompasses history, culture and politics.', related: 'cover' },
  { word: 'prevalent', definition: 'common in a particular place or time', example: 'Smartphones are prevalent among students of all ages.', related: 'widespread' },
  { word: 'detrimental', definition: 'causing harm or damage', example: 'Sleep loss is detrimental to exam performance.', related: 'harmful' },
  { word: 'beneficial', definition: 'having a good or helpful effect', example: 'Cycling to work is beneficial to both health and the environment.', related: 'advantageous' },
  { word: 'sustainable', definition: 'able to continue for a long time without harming the planet', example: 'Cities must invest in sustainable transport systems.', related: 'eco-friendly' },
  { word: 'inevitable', definition: 'certain to happen; unavoidable', example: 'Some job losses from automation may be inevitable.', related: 'unavoidable' },
  { word: 'feasible', definition: 'possible and practical to do', example: 'A complete ban on cars is not feasible for most cities.', related: 'practical' },
  { word: 'profound', definition: 'very deep, serious or great', example: 'The internet has had a profound effect on human relationships.', related: 'far-reaching' },
  { word: 'robust', definition: 'strong and unlikely to fail', example: 'The economy remained robust despite global uncertainty.', related: 'sturdy' },
  { word: 'crucial', definition: 'extremely important; decides success or failure', example: 'Early education plays a crucial role in child development.', related: 'vital' },
  { word: 'expenditure', definition: 'the total amount of money spent', example: 'Government expenditure on healthcare has doubled since 2010.', related: 'spending' },
  { word: 'consumption', definition: 'the amount of something used or eaten', example: 'Meat consumption has risen sharply in developing countries.', related: 'use' },
  { word: 'implication', definition: 'a likely result or effect of an action', example: 'The implications of artificial intelligence are still unclear.', related: 'consequence' },
  { word: 'initiative', definition: 'a new plan or action to solve a problem', example: 'The city launched an initiative to cut plastic waste.', related: 'scheme' },
  { word: 'infrastructure', definition: 'the basic systems a country needs, like roads and power', example: 'Reliable infrastructure attracts foreign investment.', related: 'framework' },
  { word: 'phenomenon', definition: 'something that happens or exists, often remarkably', example: 'Urban sprawl is a global phenomenon.', related: 'occurrence' },
  { word: 'perspective', definition: 'a particular way of thinking about something', example: 'Travel gives young people a broader perspective on the world.', related: 'viewpoint' },
  { word: 'trend', definition: 'a general direction of change over time', example: 'The trend towards remote working continues to grow.', related: 'pattern' },
  { word: 'proportion', definition: 'a part or share of the whole', example: 'A growing proportion of students study abroad.', related: 'share' },
  { word: 'category', definition: 'a group of things of the same type', example: 'The chart divides spending into five main categories.', related: 'group' },
  { word: 'impact', definition: 'a powerful effect on someone or something', example: 'Tourism has a major impact on local economies.', related: 'influence' },
  { word: 'outweigh', definition: 'to be more important or valuable than something else', example: 'The advantages far outweigh the disadvantages.', related: 'exceed' },
  { word: 'unprecedented', definition: 'never having happened before', example: 'The pandemic caused an unprecedented drop in air travel.', related: 'unparalleled' },
  { word: 'on the other hand', definition: 'used to give the opposite point of view', example: 'City life is exciting; on the other hand, it can be stressful.', related: 'conversely' },
  { word: 'as a result', definition: 'therefore; because of that', example: 'Fares rose; as a result, passenger numbers fell.', related: 'consequently' },
  { word: 'in contrast', definition: 'used to show a clear difference', example: 'In contrast, rural schools received far less funding.', related: 'by comparison' },
  { word: 'furthermore', definition: 'used to add a stronger point', example: 'Furthermore, the scheme created hundreds of jobs.', related: 'moreover' },
  { word: 'nevertheless', definition: 'despite that; however', example: 'The task was difficult; nevertheless, she finished first.', related: 'nonetheless' },
  { word: 'consequently', definition: 'as a result of that', example: 'Demand outgrew supply and consequently prices doubled.', related: 'therefore' },
  { word: 'for instance', definition: 'for example', example: 'Some habits harm health, for instance smoking.', related: 'for example' },
  { word: 'in particular', definition: 'especially; used to single one thing out', example: 'Elderly people, in particular, benefit from regular check-ups.', related: 'especially' },
  { word: 'to conclude', definition: 'used to signal the final summary', example: 'To conclude, the benefits clearly outweigh the risks.', related: 'in summary' },
];

/* ── Normalisation ───────────────────────────────────────────
   Dedupe by word, trim fields, guarantee the four-field shape
   (Reading vocab, SRS deck items and dictionary entries all
   flow through one renderer). */
export function normalizeItems(items) {
  const seen = new Set();
  const out = [];
  (items || []).forEach((it) => {
    const word = String(it?.word || '').trim();
    if (!word) return;
    const key = word.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      word,
      definition: String(it?.definition || '').trim(),
      example: String(it?.example || '').trim(),
      related: String(it?.related || '').trim(),
    });
  });
  return out;
}

/* ── All-occurrence segmentation ─────────────────────────────
   Finds EVERY match of each item (words AND multi-word phrases,
   case-insensitive, word-boundary safe), then resolves overlaps
   longest-match-first — so "account for" wins over a stray
   "account". Returns [{ text, vi? }] segments per paragraph. */
export function segmentsForXray(para, items) {
  const found = [];
  (items || []).forEach((v, vi) => {
    const word = String(v?.word || '').trim();
    if (!word) return;
    const re = new RegExp(`\\b${escapeRe(word)}\\b`, 'gi');
    let m;
    while ((m = re.exec(para))) {
      found.push({ start: m.index, end: m.index + m[0].length, vi });
      if (m.index === re.lastIndex) re.lastIndex += 1; // zero-length safety
    }
  });
  found.sort((a, b) => (a.start - b.start) || ((b.end - b.start) - (a.end - a.start)));

  const segs = [];
  let cursor = 0;
  for (const f of found) {
    if (f.start < cursor) continue;          // overlap — longest claimant wins
    if (f.start > cursor) segs.push({ text: para.slice(cursor, f.start) });
    segs.push({ text: para.slice(f.start, f.end), vi: f.vi });
    cursor = f.end;
  }
  if (cursor < para.length) segs.push({ text: para.slice(cursor) });
  return segs.length ? segs : [{ text: para }];
}

/* Which of `items` actually appear anywhere in `text`? Used by
   the Writing lens so it only lists terms the student can really
   tap in today's prompts and model answers. */
export function itemsInText(items, text) {
  const t = String(text || '');
  if (!t) return [];
  return (items || []).filter((v) => {
    const word = String(v?.word || '').trim();
    return word && new RegExp(`\\b${escapeRe(word)}\\b`, 'i').test(t);
  });
}
