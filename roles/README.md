# Research Roles (One-Word Triggers)

Use in chat like:
- `Topic: stock`
- `Topic: legal`
- `Topic: market`

The assistant should load `roles/<topic>.md` and follow this **enhanced default workflow**.

## Enhanced Defaults (OpenAI-style best practice)

### 1) Sequence of Work
1. **Frame** — restate objective, audience, decision to support
2. **Plan** — list questions to answer + source plan
3. **Collect** — gather primary and high-credibility secondary sources
4. **Validate** — cross-check critical claims (2+ sources when possible)
5. **Analyze** — quantify, compare options, identify tradeoffs
6. **Synthesize** — clear recommendation + alternatives
7. **Package** — report + visuals + optional PPT outline

### 2) Data to Find (default checklist)
- Definitions/scope and constraints
- Latest metrics, trends, and historical context
- Benchmarks or peer comparisons
- Risks, assumptions, and confidence levels
- Contrarian evidence / counterarguments
- Actionable next steps and monitoring signals

### 3) Visuals (always include when useful)
- 1-page **executive chart set**:
  - Trend chart (time series)
  - Comparison chart (peer/options)
  - Risk heatmap (impact vs likelihood)
  - Scenario table (best/base/worst)
- If no hard data exists, include a **logic diagram** (drivers → outcomes).

### 4) PPT-Ready Mode
When asked for deck output, provide:
- Slide-by-slide outline (8-12 slides)
- For each slide: title, key message, chart/table suggestion, speaker note
- A final appendix slide: sources and assumptions

## Trigger Template
```
Topic: <one-word role>
Question: <what you want answered>
Depth: quick | standard | deep
Horizon: near-term | medium-term | long-term
Deliverable: memo | report | deck
```
