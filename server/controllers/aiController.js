import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { getOwnedDataset } from '../services/datasetService.js';
import { logger } from '../utils/logger.js';

/**
 * Optional LLM answer. The client computes all statistics locally from the real
 * dataset and sends ONLY the aggregated summary (never raw rows) with explicit consent.
 * The API key stays on the server (env var OPENAI_API_KEY).
 */
export async function aiStatus(_req, res) {
  res.json({ configured: Boolean(env.OPENAI_API_KEY), model: env.OPENAI_MODEL });
}

export async function askAI(req, res) {
  if (!env.OPENAI_API_KEY) {
    throw new ApiError(503, 'AI provider is not configured on the server. Local insights are still available.', 'AI_NOT_CONFIGURED');
  }
  if (!req.body.consent) {
    throw ApiError.badRequest('You must consent to sending the dataset summary to the AI provider.');
  }
  await getOwnedDataset(req.user._id, req.body.datasetId);

  const system =
    'You are a careful data analyst. Answer ONLY using the statistics provided. ' +
    'If the statistics do not contain the answer, say so. Be concise, use bullet points, ' +
    'and mention concrete numbers from the summary.';
  const user = `Dataset summary (JSON):\n${JSON.stringify(req.body.summary).slice(0, 12000)}\n\nQuestion: ${req.body.question}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!r.ok) {
      logger.warn('ai provider error', { status: r.status });
      throw new ApiError(502, 'The AI provider returned an error. Try again later.', 'AI_PROVIDER_ERROR');
    }
    const data = await r.json();
    const answer = data?.choices?.[0]?.message?.content || '';
    res.json({ answer });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(502, 'Could not reach the AI provider.', 'AI_UNREACHABLE');
  } finally {
    clearTimeout(timer);
  }
}
