import { z } from 'zod';
import { createLLM } from '../../llmService.js';
import { extractJSON } from '../utils.js';

/**
 * checkLayout node — sends page screenshots to VLM
 * for layout quality assessment.
 */
export async function checkLayout(state) {
  const images = state.pageImages || [];

  if (!images.length) {
    return {
      layoutCheckResult: { ok: true, issues: [] },
      layoutAttempt: (state.layoutAttempt || 0) + 1,
      progressLog: 'Layout check skipped: no pages to look at.',
    };
  }

  const llm = createLLM(state.visionLlmConfig || state.llmConfig);

  const contentParts = [
    { type: 'text', text: buildLayoutPrompt() },
  ];

  // Add each page image
  for (const img of images) {
    contentParts.push({
      type: 'image_url',
      image_url: { url: `data:${img.mime || 'image/png'};base64,${img.base64}` },
    });
  }

  const message = { role: 'user', content: contentParts };

  // Schema for layout check result
  const layoutSchema = z.object({
    summary: z.string().nullish(),
    issues: z.array(z.object({ severity: z.enum(['high', 'medium', 'low']) }).passthrough())
  }).passthrough();

  const MAX_RETRIES = 2;
  let result = null;
  let messages = [message];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response;
    try {
      response = await llm.invoke(messages);
    } catch (err) {
      // a model that can't look at the pages shouldn't cost the user the converted project
      return {
        layoutCheckResult: { ok: true, issues: [], skipped: true },
        layoutAttempt: (state.layoutAttempt || 0) + 1,
        progressLog: `Layout check skipped: ${err.message}`,
      };
    }
    const raw = typeof response.content === 'string' ? response.content : '';

    const parsed = extractJSON(raw);
    if (parsed === null) {
      if (attempt < MAX_RETRIES) {
        messages = [
          message,
          { role: 'assistant', content: raw },
          { role: 'user', content:
            'Your previous response could not be parsed as valid JSON. '
            + 'Please output ONLY a valid JSON object with no extra text.' },
        ];
        continue;
      }
      // All retries exhausted — treat as parse failure, NOT as ok
      result = { ok: false, issues: [], parseError: true, raw };
      break;
    }

    const checked = layoutSchema.safeParse(parsed);
    if (!checked.success) {
      if (attempt < MAX_RETRIES) {
        messages = [message, { role: 'assistant', content: raw },
          { role: 'user', content: `The JSON has schema issues: ${checked.error.message}. Please fix it and output only the corrected JSON.` }];
        continue;
      }
      result = { ok: false, issues: [], parseError: true, raw };
      break;
    }
    result = checked.data;
    break;
  }

  if (!result) {
    result = { ok: false, issues: [], parseError: true };
  }

  const hasIssues = (result.issues || []).some(i => i.severity === 'high');
  const count = (result.issues || []).length;

  return {
    layoutCheckResult: { ...result, ok: !result.parseError && !hasIssues },
    layoutAttempt: (state.layoutAttempt || 0) + 1,
    progressLog: result.parseError
      ? 'Layout check: the model’s answer couldn’t be read.'
      : `Layout check: ${count ? `${count} ${count === 1 ? 'issue' : 'issues'} found` : 'no issues'}.`,
  };
}

function buildLayoutPrompt() {
  return `You are a LaTeX document layout reviewer.

Examine the PDF page screenshots and identify layout issues.

Return a JSON object:
{
  "summary": "brief overall assessment",
  "issues": [
    {
      "page": 1,
      "severity": "high|medium|low",
      "type": "overflow|overlap|spacing|alignment|missing_content",
      "description": "what is wrong",
      "suggestion": "how to fix in LaTeX"
    }
  ]
}

Focus on:
- Text overflow (content going beyond margins)
- Overlapping elements (figures/tables overlapping text)
- Missing content (blank pages, cut-off text)
- Severely broken formatting

Ignore minor aesthetic differences. Only flag issues that affect readability.
Output ONLY valid JSON.`;
}
