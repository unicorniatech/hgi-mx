# UL-X PROTOCOL — v1 (Especificación de trabajo)
# Fecha: 2026-01-06
# Estado: v1 (coherente con implementación inicial)
# Propósito: Definir el Protocolo Umbilical (UL-X) para sincronización ética, emocional y contextual en HGI-MX.
# Uso: Referencia interna para implementación y auditoría.

────────────────────────────────────────────────────────────
SECCIÓN 0 — ALCANCE Y PRINCIPIOS

Principios:

1. El UL-X actúa como “cordón umbilical digital” entre humanos ↔ EVA/capa afectiva ↔ Nodos Ancianos ↔ Mesh.
2. El UL-X es un protocolo de coordinación: define estados, transiciones y estructura de paquetes.
3. El UL-X debe ser determinista a nivel de máquina de estados: misma secuencia de paquetes válidos ⇒ mismo recorrido de estados.
4. Toda carga útil (payload) debe acompañarse de `ethical_metadata` para guiar minimización, filtrado y replicación selectiva.
5. El UL-X debe evitar centralización y minimizar el riesgo de reconstrucción de identidad (no audio crudo, no PII, no “raw traces”).

Formato de cada sección:
- Descripción
- Especificación técnica
- Invariantes del protocolo
- Consideraciones éticas
- Pseudocódigo (si aplica)
- Estados y transiciones
- Datos intercambiados
- Riesgos y mitigación

────────────────────────────────────────────────────────────
SECCIÓN 1 — DEFINICIÓN GENERAL DEL PROTOCOLO

### 1.1 Objetivo del UL-X
El UL-X define un ciclo de coordinación por estados para:

- Sincronizar una “intención” (capa afectiva) y una evaluación ética (HEV) hacia una forma de síntesis y liberación controlada.
- Forzar un recorrido determinista de etapas (INIT→LISTEN→SYNC→CLEANSE→SYNTH→CONSENSUS→RELEASE).
- Proveer estructura de paquete (JSON) con metadatos éticos para auditoría y mitigación.

### 1.2 Metáfora Umbilical
La metáfora “umbilical” significa:

- Hay acoplamiento controlado (ingesta, sincronización, consenso, liberación).
- La información se transmite en forma minimizada y con controles éticos.
- El sistema evita dependencia de un servidor central y distribuye verificación.

### 1.3 Alcance Técnico
Alcance técnico v1:

- Transporte: JSON.
- Estructura: `ULXPacket` (ver Sección 4).
- Determinismo: controlado por tabla de transición (ver Sección 2).
- Idempotencia: `packet_id` permite deduplicación a nivel de consumidor.
- Compatibilidad: versión de protocolo en `protocol`.

### 1.4 Componentes que interactúan

- EVA  
- Capa afectiva  
- MOLIE  
- HEV  
- Nodos personales  
- Nodos comunitarios  
- Nodos ancianos  
- Mesh P2P

Interacciones formales (mínimo v1):
- Capa afectiva y HEV producen cargas útiles para UL-X (`ULXPayload`).
- Los nodos intercambian `ULXPacket` para coordinar el ciclo.
- `ethical_metadata` acompaña la carga para filtrar, degradar o rechazar.

────────────────────────────────────────────────────────────
SECCIÓN 2 — MODELO DE ESTADOS DEL PROTOCOLO

### 2.1 Core States

- INIT
- LISTEN
- SYNC
- CLEANSE
- SYNTH
- CONSENSUS
- RELEASE

Definiciones v1:

- INIT: estado inicial; no asume payload.
- LISTEN: acepta paquetes de control para iniciar sincronización.
- SYNC: sincronización/handshake de contexto y preparación.
- CLEANSE: purificación y minimización; punto de control ético.
- SYNTH: síntesis de payload minimizado.
- CONSENSUS: etapa de consenso (propuesta/voto).
- RELEASE: liberación y cierre; puede reiniciar a INIT.

### 2.2 Transition Rules
Reglas deterministas v1 (from_state + packet_type → to_state):
- INIT + STATE → LISTEN
- LISTEN + SYNC_REQUEST → SYNC
- SYNC + SYNC_RESPONSE → CLEANSE
- CLEANSE + ETHICS → SYNTH
- SYNTH + CONSENSUS_PROPOSAL → CONSENSUS
- CONSENSUS + CONSENSUS_VOTE → RELEASE
- RELEASE + RELEASE → INIT

Reglas de rechazo v1:
- Si `packet.protocol` no coincide con la versión soportada, rechazar.
- Si `packet.state` no coincide con el estado actual del consumidor, rechazar.
- Si no existe transición para (estado actual, packet_type), rechazar.

### 2.3 Error States
Errores v1 (comportamiento mínimo):
- `ulx_protocol_mismatch`: versión no soportada.
- `ulx_packet_state_mismatch`: paquete no corresponde al estado actual.
- `ulx_invalid_transition`: transición inválida.

Degradación:
- Cuando HEV indique alto riesgo (e.g. `ethical_color` rojo), el consumidor puede cortar flujo antes de SYNTH/RELEASE.

────────────────────────────────────────────────────────────
SECCIÓN 3 — ESPECIFICACIÓN DE CAPAS

### 3.1 Capa UL-X-EVA (Entrada Humana)
Define el origen humano (pre-capacidad afectiva). En v1 se limita a ser un antecedente del ciclo; no define paquete UL-X específico.

### 3.2 Capa UL-X-AF (Síntesis)
Produce `AFIntent` que puede entrar a UL-X como `ULXPayload`.

### 3.3 Capa UL-X-MOLIE (Intención + Semántica)
Implementación actual: UL-X no define filtrado MOLIE específico; el pipeline expone ULXPayload como envoltorio determinista (AFIntent | HEVScore).

### 3.4 Capa UL-X-HEV (Ética)
Produce `HEVScore` y lo refleja en `ethical_metadata`.

### 3.5 Capa UL-X-Aldea (Consenso)
Implementación actual: consenso/votación existe como estados y packet_types (CONSENSUS_PROPOSAL/CONSENSUS_VOTE) y transiciones deterministas; no hay lógica de quorum ponderado implementada en esta capa aún.

### 3.6 Capa UL-X-Mesh
Implementación actual: UL-X publica/consume estructura ULXPacket; replicación selectiva se delega a Mesh. El daemon expone gradiente ULX por gossip (/ulx/gradient/1.0) y RPC (`/rpc/ulx/*`).

────────────────────────────────────────────────────────────
SECCIÓN 4 — TIPOS DE MENSAJE Y ESTRUCTURA DE DATOS

### 4.1 Paquetes UL-X
Estructura ULXPacket (JSON) v1:
- protocol: string (ej: `ulx/1.0.0`)
- packet_type: string (ver lista v1)
- state: string (estado actual del emisor)
- packet_id: string (id único para dedupe)
- timestamp_ms: number (epoch ms)
- payload: opcional (ULXPayload)
  - kind: 'AFIntent' | 'HEVScore'
  - value: AFIntent | HEVScore
- ethical_metadata: objeto (metadatos éticos)

Tipos de paquete (mínimo v1):
- STATE
- INTENT
- ETHICS
- SYNC_REQUEST
- SYNC_RESPONSE
- CONSENSUS_PROPOSAL
- CONSENSUS_VOTE
- RELEASE

### 4.2 Shard Packets
En v1, UL-X no define shards directamente; se integra con BIPS/Mesh en protocolos correspondientes.

### 4.3 Emotional Vectors
En v1, UL-X no transporta vectores EVA crudos; se limita a payload minimizado (p.ej. AFIntent).

### 4.4 Ethical Layer Metadata
`ethical_metadata` v1:
- ethical_color?: string
- risk_flags?: string[]
- constraints?: Record<string, unknown>

El propósito es permitir:
- Filtrado y minimización antes de replicación.
- Auditoría local de decisiones de bloqueo/degradación.

### 4.5 Mesh Replication Headers
En v1, la replicación selectiva se modela fuera de UL-X; UL-X aporta metadatos para guiarla.

### 4.6 Seguridad: Privacidad por Aniquilación
Privacidad por aniquilación (principio de diseño):
- UL-X no debe transportar audio crudo.
- UL-X debe permitir que los nodos eliminen buffers intermedios al avanzar de estado.
- La irreversibilidad verificable se integra con BIPS (envelope) donde aplique.

────────────────────────────────────────────────────────────
SECCIÓN 5 — PROCESOS CANÓNICOS

### 5.1 Proceso de Ingesta Umbilical
Proceso v1 (alto nivel):
1. INIT: preparar ciclo.
2. STATE: mover a LISTEN.
3. LISTEN: esperar SYNC_REQUEST.

### 5.2 Purificación + Evaluación HEV
Proceso v1:
- SYNC: completar handshake.
- CLEANSE: preparar evaluación/controles.
- ETHICS: gate hacia SYNTH.

### 5.3 Síntesis afectiva
Proceso v1:
- SYNTH: sintetizar payload minimizado (p.ej. AFIntent) con metadatos éticos.

### 5.4 Consenso Distribuido
Proceso v1:

- CONSENSUS_PROPOSAL: abrir ventana de consenso.
- CONSENSUS_VOTE: cerrar y pasar a RELEASE.

### 5.5 Liberación y Replicación
Proceso v1:

- RELEASE: señal de cierre.
- RELEASE en estado RELEASE reinicia a INIT.

────────────────────────────────────────────────────────────
SECCIÓN 6 — INVARIANTES DEL PROTOCOLO

Invariantes v1:

- Determinismo: no hay transición implícita; solo tabla explícita.
- Consistencia: el consumidor requiere `packet.state === state_actual`.
- Minimización: no audio crudo, no datos personales identificables.
- Auditabilidad local: todo paquete tiene `packet_id`, `timestamp_ms` y `ethical_metadata`.

────────────────────────────────────────────────────────────
SECCIÓN 7 — RIESGOS Y MITIGACIONES

### 7.1 Riesgos técnicos
Riesgos:

- Replays / duplicados de paquetes.
- Desincronización de estados entre nodos.
- Incompatibilidad de versión.

Mitigaciones v1:

- Deduplicación por `packet_id`.
- Rechazo por `ulx_packet_state_mismatch`.
- Rechazo por `ulx_protocol_mismatch`.

### 7.2 Riesgos éticos
Riesgos:

- Exposición excesiva de intentos o señales éticas.
- Sesgos o abuso del gating.

Mitigaciones v1:

- `ethical_metadata` y políticas locales de minimización.
- Bloqueo/degradación ante alto riesgo.

### 7.3 Riesgos sociales
Riesgos:

- Centralización de autoridad.
- Colusión de nodos.

Mitigaciones:

- Diseñar para mesh sin servidor central.
- Consenso distribuido (v1: interfaz mínima; expansión futura).

### 7.4 Mitigaciones recomendadas
Mitigaciones recomendadas:

- Registro local auditable de eventos UL-X.
- Políticas explícitas de retención mínima.
- Ensayos de compatibilidad de versión.

────────────────────────────────────────────────────────────
SECCIÓN 8 — VERSIONAMIENTO

### 8.1 Identidad del protocolo
Identidad v1:

- protocol: `ulx/1.0.0`

### 8.2 Reglas de evolución
Reglas de evolución:

- Cualquier nuevo estado o packet_type debe añadirse con transiciones explícitas.
- Los consumidores deben rechazar `packet_type` desconocidos.

### 8.3 Compatibilidad con versiones previas
Compatibilidad:

- Los consumidores deben validar `protocol` antes de procesar.
- En incompatibilidad, el comportamiento es rechazo determinista.

────────────────────────────────────────────────────────────
SECCIÓN 9 — APÉNDICES

### 9.1 Pseudocódigo general
Pseudocódigo general (referencia):

1. Recibir ULXPacket.
2. Verificar `protocol`.
3. Verificar `packet.state` == estado actual.
4. Aplicar transición (tabla).
5. Registrar en historial.

### 9.2 Diagramas de estados
Diagrama de estados (texto):

INIT → LISTEN → SYNC → CLEANSE → SYNTH → CONSENSUS → RELEASE → INIT

### 9.3 Ejemplos de flujo UL-X
Ejemplo (alto nivel):

STATE → SYNC_REQUEST → SYNC_RESPONSE → ETHICS → CONSENSUS_PROPOSAL → CONSENSUS_VOTE → RELEASE

### 9.4 Conexión con otros protocolos (Mesh, BIPS, TEV)
Conexión:

- Mesh: transporte/replicación de paquetes.
- BIPS: irreversibilidad y evidencia de destrucción donde aplique.

# FIN DEL DOCUMENTO (estructura lista para TRAYCER)