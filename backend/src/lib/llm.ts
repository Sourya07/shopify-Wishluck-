/**
 * Thin provider-agnostic LLM client.
 *  - provider=openai  -> any OpenAI-compatible /chat/completions endpoint
 *    (OpenAI, Gemini OpenAI-compat, OpenRouter, Groq, local Ollama ...)
 *  - provider=anthropic -> Anthropic Messages API
 *  - no key -> callers fall back to deterministic logic (the system still works)
 * Tracks token usage per run so the dashboard can show cost per run.
 */
import { config } from '../config.js';

export const llmEnabled = () => config.llm.provider !== 'none' && !!config.llm.apiKey;

export type Usage = { calls: number; inputTokens: number; outputTokens: number; usd: number };
const usageByRun = new Map<string, Usage>();
export const getUsage = (runId: string): Usage => usageByRun.get(runId) ?? { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 };
function track(runId: string | undefined, inp: number, out: number) {
  if (!runId) return;
  const u = getUsage(runId);
  u.calls++; u.inputTokens += inp; u.outputTokens += out;
  u.usd = +(u.inputTokens / 1e6 * config.llm.inputCostPerM + u.outputTokens / 1e6 * config.llm.outputCostPerM).toFixed(4);
  usageByRun.set(runId, u);
}

type Msg = { system: string; user: string; images?: string[] /* base64 png */ };

export async function llmJSON<T = any>(msg: Msg, opts: { runId?: string; maxTokens?: number; vision?: boolean } = {}): Promise<T | null> {
  if (!llmEnabled()) return null;
  const model = opts.vision && config.llm.visionModel ? config.llm.visionModel : config.llm.model;
  const maxTokens = opts.maxTokens ?? 2500;
  try {
    let text = '';
    if (config.llm.provider === 'anthropic') {
      const content: any[] = (msg.images || []).map((b64) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } }));
      content.push({ type: 'text', text: msg.user + '\n\nRespond with JSON only.' });
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': config.llm.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system: msg.system, messages: [{ role: 'user', content }] }),
        signal: AbortSignal.timeout(120000),
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || res.statusText);
      text = data.content?.map((c: any) => c.text || '').join('') ?? '';
      track(opts.runId, data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0);
      if (data.stop_reason === 'max_tokens') console.warn(`[llm] reply hit max_tokens (${maxTokens}); JSON may be cut off`);
    } else {
      const content: any[] = [{ type: 'text', text: msg.user }];
      for (const b64 of msg.images || []) content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } });
      const res = await fetch(`${config.llm.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${config.llm.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model, max_tokens: maxTokens, temperature: 0.8,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: msg.system }, { role: 'user', content: msg.images?.length ? content : msg.user }],
        }),
        signal: AbortSignal.timeout(120000),
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || res.statusText);
      text = data.choices?.[0]?.message?.content ?? '';
      track(opts.runId, data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0);
    }
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) { console.warn('[llm] no JSON object in reply'); return null; }
    try { return JSON.parse(m[0]) as T; } catch (e: any) { console.warn('[llm] could not parse JSON reply:', e.message); return null; }
  } catch (e: any) {
    console.warn('[llm] call failed, using fallback:', e.message);
    return null;
  }
}
