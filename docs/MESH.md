# Umbilical Mesh (HGI-MX)

Canon reference:

- `docs/core/hgi-core-v0.2-outline.md`

## Overview (EN)

The **Umbilical Mesh** is the distributed, reciprocity-oriented layer that propagates **synthetic, irreversible shards** across peers.

Design goals:

- **No raw human data** propagation.
- **Ephemeral-by-default** handling (memory-first), with explicit opt-in persistence rules.
- **Community-grade gossip** using libp2p + gossipsub.

## Resumen (ES)

La **Umbilical Mesh** es la capa distribuida orientada a reciprocidad que propaga **shards sintéticos e irreversibles** entre peers.

Objetivos:

- **No se propagan datos humanos crudos**.
- Manejo **efímero por defecto** (memoria primero), con reglas explícitas si existiera persistencia.
- **Gossip comunitario** usando libp2p + gossipsub.

## Libp2p / Gossipsub topics

These topic names are intended to be stable and versioned:

- `/hgi/emoshard/1.0.0`
- `/hgi/ethics/1.0.0`
- `/hgi/roles/1.0.0`
- `/hgi/ulx-metadata/1.0.0`

Future (not implemented in code yet):

- `/hgi/ulx/1.0.0`
- `/hgi/ess/1.0.0`
- `/hgi/mesh/status/1.0.0`
- `/hgi/consensus/vote/1.0.0`

Guidelines:

- **Version your topics** to avoid silent schema drift.
- Keep payloads small and structured.

## Shard propagation

### EN

- Shards are published as **synthetic representations** (e.g., ESS bundles, ULX packets).
- Nodes validate shard envelopes before relaying:
  - schema/version
  - size limits
  - declared role/weight (if included)
  - BIPS-style irreversibility guarantees (where applicable)
- Relaying should be conservative: prefer rejection over forwarding unknown formats.

### ES

- Los shards se publican como **representaciones sintéticas** (p.ej., ESS bundles, ULX packets).
- Los nodos validan el sobre antes de reenviar:
  - schema/version
  - límites de tamaño
  - rol/peso declarado (si aplica)
  - garantías de irreversibilidad tipo BIPS (si aplica)
- El reenvío debe ser conservador: mejor rechazar que propagar formatos desconocidos.

## Ephemeral memory (no persistence)

### EN

By default, mesh-received artifacts should be treated as **ephemeral**:

- Keep in memory only.
- Apply TTL/expiry.
- Avoid writing to disk unless explicitly configured and ethically reviewed.

### ES

Por defecto, los artefactos recibidos por la mesh deben tratarse como **efímeros**:

- Mantener en memoria.
- Aplicar TTL/expiración.
- Evitar escribir a disco salvo configuración explícita y revisión ética.

## No persistence (principle)

### EN

A safe baseline is:

- No automatic persistence of received shards.
- No centralized storage dependencies.
- Prefer local sovereignty: operators control retention.

### ES

Una línea base segura:

- No persistencia automática de shards recibidos.
- Sin dependencias de almacenamiento centralizado.
- Preferir soberanía local: el operador controla retención.
