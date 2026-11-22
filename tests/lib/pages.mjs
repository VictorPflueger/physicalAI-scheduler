// Every state the presenter can show, drawn in Node with the page's own modules (js/view.js and
// js/diagram.js on tests/lib/fake-dom.mjs): the seven scenarios, each on every decision path a person
// can take, cut before the decision, after each decision and at the end, and every step that is ready
// at that moment. Each state comes back as the HTML the page would hold: the step's heading and lead,
// its card, the agent's words, the diagram, the Your turn sentence and the key figures.
import { installFakeDom } from "./fake-dom.mjs";
import { loadApp } from "./harness.mjs";

/** The decision paths of one scenario, from its options, in js/estimate.js playHeadless's terms. */
export function plansFor(ids, recommended) {
  const others = ids.filter((id) => id !== recommended);
  return [
    ["recommended", { pick: recommended, drafts: "approved" }],
    ["recommended, drafts rejected", { pick: recommended, drafts: "rejected" }],
    ...others.map((id) => [`approve ${id}`, { pick: id, drafts: "approved" }]),
    [`reject ${others[0]}, then the recommended`, { pick: { reject: [others[0]], then: recommended }, drafts: "approved" }],
    ["accept the risk", { pick: "baseline", drafts: "approved" }],
    ["reject all, then accept the risk", { pick: { reject: [...ids], then: "baseline" }, drafts: "approved" }]
  ];
}

let cache = null;
/** [{ where, scenario, plan, html, story, run }] for every state; the run of each path once. */
export async function renderAll() {
  if (cache) return cache;
  const { byId } = installFakeDom();
  const app = await loadApp();
  const { renderStory, renderKpis } = await import("../../js/view.js");
  const { createDiagram } = await import("../../js/diagram.js");
  const { digest, diagramAt } = app.run;
  const { story, aiLine, keyFigures } = app.story;
  const model = app.world.getModel();
  const label = app.config.MODELS.find((m) => m.id === app.config.DEFAULT_MODEL).label;
  const diagram = createDiagram();
  const states = [];
  const paths = [];
  for (const scenario of app.SCENARIOS) {
    const first = await app.estimate.playHeadless(scenario);
    const o = first.find((e) => e.type === "options")?.payload;
    const estimate = app.estimate.estimateCost(first, scenario).eur;
    for (const [plan, how] of plansFor(o.options.map((x) => x.id), o.recommended)) {
      const events = plan === "recommended" ? first : await app.estimate.playHeadless(scenario, how);
      paths.push({ scenario, plan, events });
      const cuts = new Set();
      events.forEach((e, i) => { if (e.type === "option_decision") cuts.add(i); });
      const firstDraftDecision = events.findIndex((e) => e.type === "action_decision");
      if (firstDraftDecision > 0) cuts.add(firstDraftDecision);
      cuts.add(events.length);
      for (const n of [...cuts].sort((a, b) => a - b)) {
        const r = digest(events.slice(0, n));
        const v = story(r, { scenario, mode: "simulation" });
        const kpis = [];
        renderKpis(keyFigures(r, { mode: "simulation", estimate, model: label }), (name, f) => kpis.push(`<p>${name}: ${[f.value, f.was ? `was ${f.was}` : "", f.note].filter(Boolean).join(", ")}</p>`));
        v.steps.forEach((st, at) => {
          if (!st.ready) return;
          renderStory(r, v, at, { scenario, model, mode: "simulation", handlers: {} });
          diagram.render({ ...diagramAt(r, model, scenario.train_id, at), ai: aiLine(r, at) });
          const turn = st.turn ? `<p>Your turn. ${st.turn.text}</p>${st.turn.action ? `<button>${st.turn.action.label}</button>` : ""}` : "";
          const html = `<h2>${byId("story-title").innerHTML}</h2><p>${byId("story-lead").innerHTML}</p>${byId("story-card").innerHTML}`
            + `<figure>${byId("agent-words").innerHTML}</figure>${diagram.element.outerHTML}${turn}${kpis.join("")}`;
          states.push({ where: `${scenario.id} ${plan}, ${n === events.length ? "at the end" : `after ${n} events`}, step ${at + 1}`, scenario, plan, html, step: st, run: r });
        });
      }
    }
  }
  cache = { states, paths, app };
  return cache;
}

/** An HTML page of paragraphs, for Vici's writingProblems. */
export const page = (paragraphs) => `<html lang="en-GB"><body>${paragraphs.map((t) => `<p>${String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`).join("")}</body></html>`;

/** The visible text of a stretch of HTML, as Vici's writing check reads it (pre and code left out). */
export const visibleText = (html) => html.replace(/<(script|style|pre|code|svg)\b[\s\S]*?<\/\1>/g, "\n").replace(/<[^>]+>/g, "\n")
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
