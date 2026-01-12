# HGI-MX — Human Grounded Intelligence (Skeleton v0.1)
# Este repositorio contiene la estructura inicial del sistema HGI-MX.
# Nada aquí es implementación; es un marco técnico para Traycer + Cascade.

────────────────────────────────────────
OBJETIVO DEL REPO
────────────────────────────────────────
Proveer:
1. La estructura raíz del proyecto.
2. Los documentos canónicos iniciales (Canon + Roadmap).
3. Los módulos placeholder para EVA, ESS, HEV, MOLIE, BIPS y Mesh.
4. El entorno mínimo para que Traycer pueda:
   - analizar,
   - dividir,
   - orquestar tareas,
   - delegarlas a Cascade,
   - y versionar cada cambio usando MCP REF + MCP EXA.

El repo NO contiene lógica operativa todavía.
El repo ES la columna vertebral sobre la que Traycer construirá.

────────────────────────────────────────
ESTRUCTURA
────────────────────────────────────────

/docs
  /core
    - hgi-core-v0.2-outline.md    (Canon conceptual, SOLO estructura)
    - glossary-multiaudience.md   (Glosario multi-audiencia, SOLO estructura)
  /roadmap
    - roadmap-v1.md               (Roadmap v1 SOLO estructura)
  /protocols
    - ul-x-protocol-outline.md
    - meshnet-outline.md
    - bips-outline.md

/modules
  /eva     → placeholder.ts
  /ess     → placeholder.ts
  /hev     → placeholder.ts
  /molie   → placeholder.ts
  /bips    → placeholder.ts
  /mesh    → placeholder.ts

/client   → ui-placeholder.md
/node     → node-daemon-placeholder.ts

/config files
  - NOTES-TO-TRAYCER.md
  - .traycer-config.md
  - .cascade-rules.md
  - HGI_CANON_ROOT.md

────────────────────────────────────────
REGLAS ABSOLUTAS DEL PROYECTO
────────────────────────────────────────

1. **Este repo define el Canon.**
   Nada se borra; se versiona.
   Si se actualiza un documento, debe incluir timestamp.

2. **Toda implementación generada por IA**
   debe pasar exclusivamente por:
   → TRAYCER (planning/orquestación)
   → CASCADE (ejecución)
   con _MCP REF_ y _MCP EXA_ activados SIEMPRE.

3. **Ningún módulo puede implementarse sin consultar el Canon**  
   Canon = `/docs/core/hgi-core-v0.2-outline.md`

4. **Toda IA debe respetar irreversibilidad (BIPS)**  
   Cualquier intento de producir código que pueda reconstruir identidad humana debe ser marcado como ERROR CRÍTICO.

5. **Toda IA debe respetar Umbilical Mesh**  
   No se permite lógica centralizada o dependencias de servidores externos.

────────────────────────────────────────
GUÍA PARA IA (Traycer + Cascade)
────────────────────────────────────────

### TRAYCER
- Es el orquestador.  
- Divide módulos, crea tareas, inventaria dependencias.  
- Debe siempre referenciar explícitamente:
  - `/docs/core/hgi-core-v0.2-outline.md`
  - `/docs/core/glossary-multiaudience.md`
  - `/docs/roadmap/roadmap-v1.md`
- Antes de enviar algo a Cascade, TRAYCER debe:
  - validar coherencia con Canon,
  - validar irreversibilidad (BIPS),
  - generar contexto mínimo para aprobación humana.

### CASCADE
- Es el ejecutor del código.
- Cada cambio debe incluir:
  - `MCP REF` → referenciar el archivo.
  - `MCP EXA` → ejemplo aplicado del diff.
- Ningún archivo se modifica sin patch limpio.

────────────────────────────────────────
ESTADO ACTUAL
────────────────────────────────────────

✔ Estructura completa generada  
✔ Documentos placeholder añadidos  
✔ Módulos iniciales vacíos creados  
✔ Listo para ingestión de Traycer

Próximo paso (humano):
→ Revisar /NOTES-TO-TRAYCER.md  
→ Confirmar que la instrucción para orquestación es correcta  
→ Iniciar sesión de Traycer dentro de Windsurf

────────────────────────────────────────
LICENCIA
────────────────────────────────────────
HGI-MX es un proyecto experimental autónomo.  
Cada nodo fundador conserva soberanía.  
No licenciar fuera de la Mesh sin consenso ético.