// Parse a claude -p stream-json transcript and aggregate token usage per subagent.
// Usage snapshots repeat per streamed event of the same message -> dedupe by message.id,
// keeping the max of each usage field (cumulative within a message).
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
const taskMap = new Map();  // tool_use_id -> {type, desc}
const msgs = new Map();     // message.id -> {parent, model, usage:{...}, toolUses:Set}
let resultEvent = null;

for (const file of files) {
  for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    let ev; try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'result') { resultEvent = ev; continue; }
    if (ev.type !== 'assistant' || !ev.message) continue;

    for (const block of ev.message.content ?? []) {
      if (block.type === 'tool_use' && (block.name === 'Task' || block.name === 'Agent')) {
        taskMap.set(block.id, {
          type: block.input?.subagent_type ?? '?',
          desc: (block.input?.description ?? '').slice(0, 42),
        });
      }
    }

    const id = ev.message.id;
    if (!id) continue;
    if (!msgs.has(id)) msgs.set(id, {
      parent: ev.parent_tool_use_id ?? null,
      model: ev.message.model ?? '',
      usage: { in: 0, out: 0, cacheW: 0, cacheR: 0 },
      toolUses: new Set(),
    });
    const m = msgs.get(id);
    const u = ev.message.usage;
    if (u) {
      m.usage.in = Math.max(m.usage.in, u.input_tokens ?? 0);
      m.usage.out = Math.max(m.usage.out, u.output_tokens ?? 0);
      m.usage.cacheW = Math.max(m.usage.cacheW, u.cache_creation_input_tokens ?? 0);
      m.usage.cacheR = Math.max(m.usage.cacheR, u.cache_read_input_tokens ?? 0);
    }
    for (const b of ev.message.content ?? []) if (b.type === 'tool_use') m.toolUses.add(b.id);
  }
}

const groups = new Map();
for (const m of msgs.values()) {
  let key, label;
  if (m.parent === null) { key = '__main__'; label = 'ORQUESTADOR (main)'; }
  else {
    const t = taskMap.get(m.parent);
    key = m.parent;
    label = t ? `${t.type} [${t.desc}]` : `sidechain ${m.parent.slice(-6)}`;
  }
  if (!groups.has(key)) groups.set(key, { label, model: m.model, apiCalls: 0, tools: 0, in: 0, out: 0, cacheW: 0, cacheR: 0 });
  const g = groups.get(key);
  g.apiCalls += 1;
  g.tools += m.toolUses.size;
  g.in += m.usage.in; g.out += m.usage.out; g.cacheW += m.usage.cacheW; g.cacheR += m.usage.cacheR;
}

const rows = [...groups.values()].map(g => ({
  agente: g.label, modelo: g.model.replace(/claude-|-20\d{6}/g, ''),
  api_calls: g.apiCalls, tools: g.tools,
  input: g.in, output: g.out, cache_write: g.cacheW, cache_read: g.cacheR,
}));
rows.sort((a, b) => (b.input + b.cacheW + b.cacheR) - (a.input + a.cacheW + a.cacheR));

// Cost model (USD/MTok): Sonnet 5 promo in=2, out=10, cacheW(1h)=4, cacheR=0.2; Haiku 4.5 in=1, out=5, cacheW(1h)=2, cacheR=0.1
function cost(r) {
  const s = r.modelo.includes('haiku') ? { i: 1, o: 5, w: 2, r: 0.1 } : { i: 2, o: 10, w: 4, r: 0.2 };
  return (r.input * s.i + r.output * s.o + r.cache_write * s.w + r.cache_read * s.r) / 1e6;
}
let totalCost = 0;
for (const r of rows) { r.usd = Math.round(cost(r) * 1000) / 1000; totalCost += cost(r); }
console.log(JSON.stringify(rows, null, 1));
console.log(`\nTOTAL estimado (pricing promo Sonnet5 + Haiku4.5, cache 1h): $${totalCost.toFixed(2)}`);

if (resultEvent) {
  const { total_cost_usd, duration_ms, num_turns, modelUsage, subtype } = resultEvent;
  console.log('=== RESULT (CLI) ===');
  console.log(JSON.stringify({ subtype, total_cost_usd, duration_min: Math.round(duration_ms / 6000) / 10, num_turns, modelUsage }, null, 1));
}
