# Nodes (HGI-MX)

Canon reference:

- `docs/core/hgi-core-v0.2-outline.md`

## Overview (EN)

A **node** is a laptop/host participating in the Human Grounded Intelligence Mesh. Nodes can run local pipeline modules (EVA/AF/HEV/MOLIE/BIPS/ULX/ESS) and optionally join the Umbilical Mesh daemon.

## Resumen (ES)

Un **nodo** es una laptop/host participando en la Human Grounded Intelligence Mesh. Los nodos pueden correr módulos locales del pipeline (EVA/AF/HEV/MOLIE/BIPS/ULX/ESS) y opcionalmente unirse al daemon de Umbilical Mesh.

## Node types

| Node type | Intent (EN) | Intención (ES) |
| --- | --- | --- |
| founder | Seed/anchor node for initial bootstrap and canon stewardship | Nodo semilla/ancla para bootstrap inicial y custodia del canon |
| elder | Ethical court, long-horizon consensus stabilizer | Tribunal ético, estabilizador de consenso de largo horizonte |
| purifier | Noise/harm minimization, filtering and cleanup | Minimización de ruido/daño, filtrado y limpieza |
| eva | Sensory-focused node class (EVA pipeline emphasis) | Nodo sensorial (énfasis EVA) |
| ghost | Observer-only, minimal weight participation | Observador, participación de peso mínimo |

## Configuration (ENV)

> Note: env var names are aligned with `.env.example` where present, and otherwise reflect current runtime defaults in the codebase.

### Core

- `HGI_NODE_TYPE`
  - **EN**: Primary node type/role (e.g. `founder`, `elder`, `purifier`, `eva`, `ghost`).
  - **ES**: Tipo/rol principal del nodo.

- `HGI_LISTEN_PORT`
  - **EN**: Daemon listen port for the node.
  - **ES**: Puerto de escucha del daemon.

- `HGI_BOOTSTRAP_NODES`
  - **EN**: Comma-separated list of bootstrap multiaddrs.
  - **ES**: Lista separada por comas de multiaddrs de bootstrap.

### UI / Proxy / Daemon

- `HGI_DAEMON_PORT`
  - **EN**: Daemon HTTP API port (defaults to `7777` in code if not set).
  - **ES**: Puerto del API HTTP del daemon.

- `HGI_UI_PORT`
  - **EN**: UI proxy port (defaults may be overridden; used by UI dev server proxying).
  - **ES**: Puerto del proxy de UI.

## Multi-laptop bootstrap (practical)

### EN

1. Choose one laptop as the initial bootstrap node (often `founder`).
2. Start the daemon on that machine and note its multiaddr(s).
3. On other laptops, set `HGI_BOOTSTRAP_NODES` to include the bootstrap multiaddr(s).
4. Start daemons and verify peer discovery.

Recommended approach:

- Keep bootstrap addresses in a shared document and rotate carefully.
- Use a small initial cluster (2–4 nodes) to validate gossip propagation.

### ES

1. Elige una laptop como nodo de bootstrap inicial (normalmente `founder`).
2. Inicia el daemon en esa máquina y anota sus multiaddr(s).
3. En otras laptops, configura `HGI_BOOTSTRAP_NODES` con esos multiaddr(s).
4. Inicia los daemons y verifica descubrimiento de peers.

Recomendación:

- Mantén direcciones de bootstrap en un documento compartido y rota con cuidado.
- Usa un cluster inicial pequeño (2–4 nodos) para validar propagación por gossip.
