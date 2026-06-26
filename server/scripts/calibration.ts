// Scoring calibration eval (D12 "required gate"). Runs the real Analyst on
// hand-built transcripts and asserts: (1) a concise, specific answer is NOT
// outscored by a padded, empty one (verbosity-bias), and (2) golden transcripts
// land in the expected band. Needs ANTHROPIC_API_KEY. Run: `npm run eval`.
import { analyzeInterview } from '../src/agents.js';
import { createAnthropicClient } from '../src/llm/index.js';
import type { InterviewConfig } from '../src/domain.js';

const config: InterviewConfig = {
  id: 'cal', userId: 'eval', mode: 'mock', role: 'Product Manager', persona: 'aria',
  style: 'balanced', language: 'en', lengthMinutes: 15, createdAt: new Date(0).toISOString(),
};
const llm = createAnthropicClient();
const Q = 'Tell me about a product decision you owned and its impact.';

const CONCISE = [{ q: Q, a: 'I owned our checkout redesign. I cut the form from 9 fields to 4, ran an A/B test on 50% of traffic for two weeks, and cart drop-off fell from 31% to 25% — about 4,000 extra completed orders a month. I decided to ship the smaller version first because the data showed field count, not payment options, was the blocker.' }];
const PADDED = [{ q: Q, a: 'So, you know, product is really about the user at the end of the day, and I think a lot about that. We did a lot of great work as a team and I was definitely involved in a bunch of decisions. It was a journey, honestly, and we learned so much. I really care about impact and moving metrics and all of that, and I think that came through in everything we did together as a group.' }];
const STRONG = [
  { q: Q, a: 'I owned the onboarding revamp; activation rose from 38% to 52% over a quarter after I sequenced the steps by drop-off data and removed two optional fields.' },
  { q: 'Tell me about a disagreement.', a: 'Engineering wanted to rebuild the pipeline; I proposed a thin adapter instead, we shipped in three weeks vs an estimated three months, and revisited the rebuild once we had usage data.' },
];

async function main() {
  console.log('Running real-API calibration eval…\n');
  const [concise, padded, strong] = await Promise.all([
    analyzeInterview(llm, config, 'concise', CONCISE),
    analyzeInterview(llm, config, 'padded', PADDED),
    analyzeInterview(llm, config, 'strong', STRONG),
  ]);

  let pass = true;
  const check = (name: string, ok: boolean, detail: string) => { console.log(`${ok ? '✓' : '✗'} ${name} — ${detail}`); if (!ok) pass = false; };

  check('verbosity-bias', concise.overallScore >= padded.overallScore,
    `concise=${concise.overallScore} (${concise.band}) must be >= padded=${padded.overallScore} (${padded.band})`);
  check('concise lands solid+', concise.overallScore >= 55, `concise=${concise.overallScore} (${concise.band})`);
  check('padded penalized', padded.overallScore < 60, `padded=${padded.overallScore} (${padded.band})`);
  check('strong lands strong+', ['strong', 'exceptional'].includes(strong.band) || strong.overallScore >= 70, `strong=${strong.overallScore} (${strong.band})`);
  // evidence integrity: every kept quote must be verbatim (verifier already filtered) — assert non-empty evidence on the strong one
  check('strong has cited evidence', strong.competencyScores.some((c) => c.evidence.length > 0), `evidence groups present`);

  console.log(`\n${pass ? 'CALIBRATION PASS ✓' : 'CALIBRATION FAIL ✗'}`);
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error('eval error:', e instanceof Error ? e.message : e); process.exit(1); });
