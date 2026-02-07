// TODO: This file will host the client UI core (placeholder).
// This file exists only to give Traycer and the architect a location to expand.
// Do not implement logic until instructed.
// Always use MCP REF + MCP EXA when writing code.

// Traycer:
// - Reference `/docs/roadmap/roadmap-v1.md` (Sections 2-4) when scoping UI tasks.
// - Keep changes atomic and versionable.

export interface UIComponentProps {
  id: string;
}

export interface UIComponent {
  name: string;
  render(props: UIComponentProps): string;
}

export const UI_PLACEHOLDER_COMPONENTS: UIComponent[] = [
  {
    name: 'ShardTimeline',
    render: (props: UIComponentProps) => {
      void props;
      return 'TODO(UI): ShardTimeline';
    },
  },
  {
    name: 'EthicalGradientBadge',
    render: (props: UIComponentProps) => {
      void props;
      return 'TODO(UI): EthicalGradientBadge';
    },
  },
  {
    name: 'MeshNodeCard',
    render: (props: UIComponentProps) => {
      void props;
      return 'TODO(UI): MeshNodeCard';
    },
  },
];
