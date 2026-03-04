"use strict";

function buildAnalysisPrompt(task, state) {
  return [
    "You are a web automation planner. Analyze the task and output a compact plan JSON.",
    "Output ONLY a JSON object with this shape:",
    '{"hard_filters":["..."],"preferences":["..."],"steps":["..."],"target_site":"..."}',
    "",
    "hard_filters: conditions that MUST be satisfied (e.g. '不要包装盒', '国行', '256GB')",
    "preferences: soft goals to optimize (e.g. '最便宜', '最新')",
    "steps: ordered list of high-level steps to complete the task",
    "target_site: the domain/site to use",
    "",
    "Task: " + task,
    "Current URL: " + state.url,
    "Page title: " + state.title,
  ].join("\n");
}

function parseAnalysisResponse(raw, extractJsonObject) {
  try {
    const jsonText = extractJsonObject(raw);
    if (!jsonText) return null;
    const obj = JSON.parse(jsonText);
    if (!Array.isArray(obj.steps)) return null;
    return {
      hard_filters: Array.isArray(obj.hard_filters) ? obj.hard_filters : [],
      preferences: Array.isArray(obj.preferences) ? obj.preferences : [],
      steps: obj.steps.map(String),
      target_site: String(obj.target_site || ""),
    };
  } catch (_err) {
    return null;
  }
}

async function runAnalysisPhase(task, state, model, runPlanner, extractJsonObject) {
  const backend = String(process.env.OWA_AGENT_BACKEND || "auto").toLowerCase();
  if (backend === "codex" || backend === "codex-cli") {
    return { ok: true, plan: { hard_filters: [], preferences: [], steps: [task], target_site: "" } };
  }
  const prompt = buildAnalysisPrompt(task, state);
  const planRet = await runPlanner(prompt, model, null, { rawMode: true });
  if (!planRet.ok) return { ok: false, error: planRet.error };
  const plan = parseAnalysisResponse(planRet.raw, extractJsonObject);
  if (!plan) return { ok: false, error: "analysis phase returned invalid plan JSON" };
  return { ok: true, plan };
}

module.exports = {
  buildAnalysisPrompt,
  parseAnalysisResponse,
  runAnalysisPhase,
};
