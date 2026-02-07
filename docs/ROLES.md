# Roles & Weights (HGI-MX)

Canon reference:

- `docs/core/hgi-core-v0.2-outline.md`

## Overview (EN)

HGI-MX uses role-weighting for mesh participation and consensus signaling. Roles are intentionally simple and composable.

## Resumen (ES)

HGI-MX usa ponderación por rol para participación en la mesh y señalización de consenso. Los roles se mantienen simples y componibles.

## Roles table

| Role | Weight | Purpose (EN) | Propósito (ES) |
| --- | ---: | --- | --- |
| founder | 1.0 | Foundational authority for bootstrapping and canon stewardship | Autoridad fundacional para bootstrap y custodia del canon |
| elder | 0.8 | Ethical court / slow consensus guardrail | Tribunal ético / barrera lenta de consenso |
| purifier | 0.6 | Noise removal / harm minimization | Remoción de ruido / minimización de daño |
| instigator | 0.4 | Constructive contradiction / stress-testing consensus | Contradicción constructiva / prueba de estrés del consenso |
| eva | 0.3 | Sensory pipeline node class (EVA-focused) | Clase de nodo sensorial (enfocado en EVA) |
| user | 0.1 | Standard citizen participation | Participación ciudadana estándar |
| ghost | 0.01 | Observer / low-impact presence | Observador / presencia de bajo impacto |

## Invariants / Validation

### Invariants (EN)

- A role weight MUST be in the inclusive range `[0, 1]`.
- Role weights MUST be stable across a network epoch (no per-request dynamic weighting).
- A node SHOULD have exactly one primary role for scoring/consensus.
- If multiple roles are present, the effective weight MUST be deterministic (recommended: `max(role_weights)`), and MUST be reported explicitly.
- A node MUST never claim `founder` unless explicitly provisioned by local operator configuration.

### Invariantes (ES)

- Un peso de rol DEBE estar en el rango inclusivo `[0, 1]`.
- Los pesos DEBEN ser estables durante un epoch de red (sin ponderación dinámica por request).
- Un nodo DEBERÍA tener un rol primario para scoring/consenso.
- Si hay múltiples roles, el peso efectivo DEBE ser determinístico (recomendado: `max(pesos)`), y DEBE reportarse explícitamente.
- Un nodo NUNCA debe reclamar `founder` sin provisión explícita por configuración del operador local.

### Suggested validation checks (EN)

- Reject unknown roles unless running in a permissive/dev mode.
- Reject weights outside `[0, 1]`.
- Log role assertions and changes.

### Validación sugerida (ES)

- Rechazar roles desconocidos salvo en modo permisivo/dev.
- Rechazar pesos fuera de `[0, 1]`.
- Registrar afirmaciones de rol y cambios.
