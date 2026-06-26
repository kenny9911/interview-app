// Specialized prompt-module registry: per interview TYPE, per interviewer ROLE,
// and per TOPIC focus. The deep modules are authored by domain experts and live
// in ./library.json (Phase-2 prompt-library workflow). This file loads them,
// merges seed fallbacks, and resolves a user's topic/role string to the right
// module. (docs/40-prompt-system.md; original brief: specialized expert per
// type / role / topic.)
import type { Mode, Persona } from '../domain.js';
import libraryData from './library.json' with { type: 'json' };

export interface PromptModule {
  key: string;
  title: string;
  guidance: string;
  themes: string[];
  sampleQuestions?: string[];
  whatGoodLooksLike?: string;
  matchKeywords?: string[];
}

interface RawModule extends PromptModule { kind: 'topic' | 'mode' | 'role' }
const library = libraryData as { topics: RawModule[]; modes: RawModule[]; roles: RawModule[] };

const stripPrefix = (key: string) => key.split(':').slice(1).join(':') || key;
const indexByShortKey = (mods: RawModule[]): Record<string, PromptModule> =>
  Object.fromEntries(mods.map((m) => [stripPrefix(m.key), m]));

/* ---- per interview TYPE ---- */
const SEED_MODES: Record<Mode, PromptModule> = {
  mock: { key: 'mode:mock', title: 'Mock interview', guidance: 'A full scored practice round mirroring a real screening.', themes: ['behavioral', 'role depth'] },
  topic_practice: { key: 'mode:topic_practice', title: 'Topic practice', guidance: 'Focused drilling of one skill with instant coaching.', themes: ['fundamentals', 'applied scenario'] },
  capability_assessment: { key: 'mode:capability_assessment', title: 'Capability assessment', guidance: 'Structured, comparable evaluation against a rubric.', themes: ['competency coverage'] },
  real: { key: 'mode:real', title: 'Real interview (employer-scheduled)', guidance: 'P1 — employer-supplied question set; stubbed in MVP.', themes: ['employer-defined'] },
  expert_interview: { key: 'mode:expert_interview', title: 'Expert interview (inverted)', guidance: 'P1 — user interviews an expert AI; distinct output.', themes: ['knowledge extraction'] },
};
const libModes = indexByShortKey(library.modes);
export const MODE_MODULES: Record<Mode, PromptModule> = {
  mock: libModes.mock ?? SEED_MODES.mock!,
  topic_practice: libModes.topic_practice ?? SEED_MODES.topic_practice!,
  capability_assessment: libModes.capability_assessment ?? SEED_MODES.capability_assessment!,
  real: SEED_MODES.real!,
  expert_interview: SEED_MODES.expert_interview!,
};

/* ---- per interviewer ROLE ---- */
const SEED_ROLES: Record<string, PromptModule> = {
  hiring_manager: { key: 'role:hiring_manager', title: 'Hiring manager lens', guidance: 'Probe fit, ownership, and concrete outcomes.', themes: ['ownership', 'outcomes'] },
  peer: { key: 'role:peer', title: 'Peer lens', guidance: 'Probe working style and realistic team scenarios.', themes: ['collaboration', 'problem-solving'] },
  director: { key: 'role:director', title: 'Director lens', guidance: 'Probe judgment, prioritization, and impact at scale.', themes: ['judgment', 'impact'] },
};
const libRoles = indexByShortKey(library.roles);
export const ROLE_LENS: Record<string, PromptModule> = {
  hiring_manager: libRoles.hiring_manager ?? SEED_ROLES.hiring_manager!,
  peer: libRoles.peer ?? SEED_ROLES.peer!,
  director: libRoles.director ?? SEED_ROLES.director!,
};

/* ---- per TOPIC focus ---- */
export const TOPIC_MODULES: Record<string, PromptModule> = {
  general: library.topics.find((t) => stripPrefix(t.key) === 'general_behavioral') ?? {
    key: 'topic:general', title: 'General', guidance: 'Cover the breadth implied by the role.', themes: [],
  },
  ...indexByShortKey(library.topics),
};

// Keyword → topic short-key index, built from each expert module's matchKeywords.
const TOPIC_KEYWORD_INDEX: { kw: string; key: string }[] = library.topics
  .flatMap((t) => (t.matchKeywords ?? []).map((kw) => ({ kw: kw.toLowerCase(), key: stripPrefix(t.key) })))
  .sort((a, b) => b.kw.length - a.kw.length); // prefer the most specific match

export function personaToRoleKey(persona: Persona): keyof typeof ROLE_LENS {
  return persona === 'aria' ? 'hiring_manager' : persona === 'sam' ? 'peer' : 'director';
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whole-token match so short acronyms (pm, hr, ta) don't match inside words
// like "totally", while multi-word phrases ("product manager") still match.
const wordMatch = (haystack: string, kw: string): boolean =>
  new RegExp(`(^|[^a-z0-9])${escapeRe(kw)}([^a-z0-9]|$)`, 'i').test(haystack);

/** Resolve a free-text topicFocus (or role) to a registry topic key. */
export function resolveTopicKey(focus?: string): string {
  if (!focus) return 'general';
  const f = focus.toLowerCase();
  const hit = TOPIC_KEYWORD_INDEX.find((e) => wordMatch(f, e.kw));
  return hit?.key ?? 'general';
}

/** Compose the specialist guidance block injected into Planner + Interviewer. */
export function composeSpecialistGuidance(args: {
  mode: Mode;
  persona: Persona;
  topicFocus?: string;
  role?: string;
}): { guidance: string; themes: string[] } {
  const mode = MODE_MODULES[args.mode]!;
  const role = ROLE_LENS[personaToRoleKey(args.persona)]!;
  // resolve topic from the explicit focus, falling back to the role string
  const topic = TOPIC_MODULES[resolveTopicKey(args.topicFocus ?? args.role)] ?? TOPIC_MODULES.general!;

  const topicBlock = [
    `[Topic focus — ${topic.title}] ${topic.guidance}`,
    topic.sampleQuestions?.length ? `Exemplar questions (rephrase in your own voice): ${topic.sampleQuestions.slice(0, 4).map((q) => `"${q}"`).join(' ')}` : '',
    topic.whatGoodLooksLike ? `Strong vs weak answers: ${topic.whatGoodLooksLike}` : '',
  ].filter(Boolean).join('\n');

  const guidance = [
    `[Interview type — ${mode.title}] ${mode.guidance}`,
    `[Interviewer lens — ${role.title}] ${role.guidance}`,
    topicBlock,
  ].join('\n\n');

  const themes = [...new Set([...(mode.themes ?? []), ...(role.themes ?? []), ...(topic.themes ?? [])])];
  return { guidance, themes };
}
