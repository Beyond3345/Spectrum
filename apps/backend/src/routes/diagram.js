import { drawSymbols, symbolsRequestError } from '../services/symbolService.js';

export function registerDiagramRoutes(fastify) {
  // the circuit composer's symbols, drawn by the installed circuitikz in the diagram's style (symbolService.js)
  fastify.post('/api/diagram/symbols', async (req, reply) => {
    const problem = symbolsRequestError(req.body);
    if (problem) return reply.code(400).send({ ok: false, error: problem });
    return drawSymbols(req.body);
  });
}
