# Research Roles

Use in chat like:

- `Topic: stock`
- `Topic: market`
- `Topic: policy`

When a role is selected, the assistant should load `roles/<topic>.md`, adopt that role's defaults, then ask only for missing critical inputs before starting research.

## Shared Defaults (apply unless overridden)
- **Mode:** deep research
- **Evidence standard:** cite sources with links and date
- **Recency:** prioritize latest credible sources, then foundational references
- **Output style:** executive summary first, then detailed analysis
- **Uncertainty:** explicitly label assumptions, unknowns, and confidence
- **Bias check:** include at least one counterpoint section
- **Deliverables:** conclusions + actionable next steps

## Trigger format (recommended)
```
Topic: <role>
Question: <what you want answered>
Depth: quick | standard | deep
Horizon: near-term | medium-term | long-term
Constraints: <budget/time/region/etc>
```
