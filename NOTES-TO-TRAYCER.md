# Notes to Traycer (Task Orchestrator)

## Non-negotiable task framing rules

- When sending implementation tasks to Cascade, you MUST explicitly require: **use MCP REF + MCP EXA markers** whenever generating or modifying code files.
- Before creating ANY tasks, you MUST read ALL files under:
  - `/docs/core/`
  - `/docs/protocols/`
  - `/docs/roadmap/`

## Versioning + change control

- Keep changes versionable: prefer small, atomic commits.
- Each task should:
  - Reference the canonical doc(s) used (path + section heading).
  - Scope changes to the minimum set of files.
  - Avoid mixing formatting-only changes with functional changes.

## Canon handling

- Do NOT ask Cascade to write canon content.
- Only evolve canon structure/outlines unless explicitly instructed by the architect.
