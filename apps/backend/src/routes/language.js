import { changeWord, checkWords, installDictionary, listLanguages, listWords, pruneDictionaries, spellStatus, suggestWord } from '../services/spellService.js';
import { MAX_GRAMMAR_CHARS, changeIgnoredRule, checkGrammar, grammarStatus, readIgnoredRules } from '../services/grammarService.js';

/** A checker that couldn't start answers 503 with its reason, so the editor can say so and carry on. */
const unavailable = (reply, err) => reply.code(503).send({ error: err instanceof Error ? err.message : String(err) });

export function registerLanguageRoutes(fastify) {
  fastify.get('/api/spell/status', async () => spellStatus());

  fastify.post('/api/spell/check', async (req, reply) => {
    const { words, projectId, lang } = req.body || {};
    if (!Array.isArray(words)) return reply.code(400).send({ error: 'Send the words to check.' });
    try {
      return { misspelt: await checkWords(words, projectId, lang) };
    } catch (err) {
      if (err?.statusCode) throw err;
      return unavailable(reply, err);
    }
  });

  fastify.post('/api/spell/suggest', async (req, reply) => {
    const { word, lang } = req.body || {};
    if (typeof word !== 'string' || !word.trim()) return reply.code(400).send({ error: 'Send a word.' });
    try {
      return { suggestions: await suggestWord(word, lang) };
    } catch (err) {
      return unavailable(reply, err);
    }
  });

  fastify.get('/api/spell/words', async (req) => listWords(req.query?.projectId));

  // the catalogue's languages and their dictionaries on this computer; a dictionary downloads only when asked
  fastify.get('/api/languages', async () => ({ languages: await listLanguages() }));

  fastify.post('/api/languages/:tag/dictionary', async (req) => installDictionary(req.params.tag));

  fastify.post('/api/languages/prune', async (req, reply) => {
    const { keep } = req.body || {};
    if (!Array.isArray(keep) || keep.some((tag) => typeof tag !== 'string')) return reply.code(400).send({ error: 'Send the languages to keep.' });
    return pruneDictionaries(keep);
  });

  fastify.post('/api/spell/words', async (req, reply) => {
    const { word, scope, projectId, remove } = req.body || {};
    try {
      return await changeWord({ word, scope: scope === 'project' ? 'project' : 'global', projectId, remove: !!remove });
    } catch (err) {
      if (err?.statusCode) throw err;
      return reply.code(400).send({ error: err.message });
    }
  });

  fastify.get('/api/grammar/status', async () => grammarStatus());

  fastify.post('/api/grammar/check', async (req, reply) => {
    const { text, file, projectId, style, oxford, language } = req.body || {};
    if (typeof text !== 'string') return reply.code(400).send({ error: 'Send the text to check.' });
    if (text.length > MAX_GRAMMAR_CHARS) return reply.code(413).send({ error: 'That file is too long to check in one go.' });
    const ignoredRules = projectId ? await readIgnoredRules(projectId) : [];
    try {
      return { issues: await checkGrammar({ text, file, style: !!style, oxford, ignoredRules, language, projectId }), ignoredRules };
    } catch (err) {
      return unavailable(reply, err);
    }
  });

  fastify.get('/api/grammar/ignored', async (req, reply) => {
    const { projectId } = req.query || {};
    if (!projectId) return reply.code(400).send({ error: 'Choose a project.' });
    return { ignoredRules: await readIgnoredRules(projectId) };
  });

  fastify.post('/api/grammar/ignored', async (req, reply) => {
    const { projectId, rule, remove } = req.body || {};
    if (!projectId || typeof rule !== 'string' || !rule) return reply.code(400).send({ error: 'Choose a project and a rule.' });
    return { ignoredRules: await changeIgnoredRule(projectId, rule, !!remove) };
  });
}
