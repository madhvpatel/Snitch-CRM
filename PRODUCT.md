# Product

## Register

product

## Users

Three primary audiences use this enforcement CRM daily:

1. **Field Investigators & Agents** — Collect evidence in real-time (audio, video, geolocation) and file cases. Need rapid evidence capture, confidence metrics, and status visibility.
2. **Legal/Case Managers** — Assess legal readiness, evaluate cases for litigation, make prosecution decisions. Need completeness checklists, confidence scores, evidence summaries, audit trails.
3. **Administrators/Supervisors** — Coordinate workflows, assign cases to agents, monitor enforcement metrics, report outcomes. Need dashboards, assignment interfaces, bulk operations, and accountability views.

All roles work under time pressure, with high stakes (revenue recovery, legal compliance).

## Product Purpose

**Snitch** centralizes music copyright enforcement investigations. It gives investigators, lawyers, and administrators a single source of truth for evidence, legal readiness assessment, case assignments, and recovery tracking. The system automates evidence verification (chain of custody, forensic analysis), guides legal decision-making (licensing gates, prosecution strength), and maintains audit trails for court admissibility and compliance.

Success means:
- Investigators can file cases with confidence; evidence is legally defensible.
- Lawyers can assess litigation readiness without manual digging.
- Admins can track enforcement metrics, assignment backlogs, and recovery value.
- Every case is auditable from capture to resolution.

## Brand Personality

**Authoritative. Precise. Trustworthy.**

The tool feels like law enforcement / legal infrastructure, not a consumer product. Users rely on it for consequential decisions (prosecution, settlement, venue compliance), so the interface must communicate that every data point has been verified and that the system knows what it's doing. There's no place for hedging, hand-waving, or "cute" affordances.

Tone: Professional, institutional, unflinching. The system is competent and calm under pressure.

## Anti-references

- **Not casual SaaS** (Slack, Figma, Notion aesthetic). This isn't a fun workspace; it's law enforcement infrastructure.
- **Not technically obscure**. No jargon in UI labels. Users are lawyers and investigators, not engineers; the interface speaks their language.
- **Not trendy**. No glassmorphism, no large hero sections, no gradients as decoration. The design should feel timeless and established, like a courthouse or police system.

## Design Principles

1. **Trust through precision** — Every data point is source-verified. Audit trails are always visible. No guesses, no hand-waving.
2. **Institutional confidence** — The tool looks and feels like law enforcement / legal infrastructure. Users know they can rely on it.
3. **Action before information** — Surface what users need to act on right now. Hide complexity that doesn't drive a decision.
4. **Clear without noise** — Dark theme, minimal color, spacious. Users focus on cases, not the interface.
5. **Cross-role transparency** — Different roles see different affordances, but all see evidence, timeline, and accountability. Collaboration leaves an audit trail.

## Accessibility & Inclusion

- **WCAG AA compliance** (minimum).
- **Keyboard navigation** throughout; no mouse-only affordances.
- **Screen reader ready**: semantic HTML, labels, live regions for real-time updates.
- **Reduced motion support**: animations pause under `prefers-reduced-motion`.
- **Color-blind accessible**: do not rely on color alone to communicate status (red/green/amber use icons and text, not just color).
- **Field conditions**: The tool may be used in vehicles, in low-light conditions, or by users working long hours. High contrast and large touch targets are critical.
