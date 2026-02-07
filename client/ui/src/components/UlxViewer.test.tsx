import React from 'react';
import { render, screen } from '@testing-library/react';

import UlxViewer from './UlxViewer';

type MockResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

describe('UlxViewer', () => {
  it('redacts intention_core and semantic_core from payload previews', async () => {
    const packet = {
      protocol: 'ulx/1.0.0',
      packet_type: 'ULX_PACKET',
      state: 'RELEASE',
      packet_id: 'p1',
      timestamp_ms: Date.now(),
      ethical_metadata: { ethical_color: 'green_safe', risk_flags: [] },
      states: [
        {
          layer: 'C1',
          version: '1',
          message_id: 'm1',
          sender_node_id: 'n1',
          timestamp: Date.now(),
          payload: {
            safe_field: 'ok',
            intention_core: 'DO_NOT_SHOW',
            nested: { semantic_core: 'DO_NOT_SHOW_2' },
          },
        },
      ],
      final: 'RELEASE',
    };

    const fetchMock = vi.fn(async () => {
      const res: MockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(packet),
      };
      return res as any;
    });
    vi.stubGlobal('fetch', fetchMock as any);

    render(<UlxViewer id="p1" />);

    await screen.findByText('ULX Packet');

    expect(screen.getByText(/\[REDACTED\]/)).toBeInTheDocument();
    expect(screen.queryByText('DO_NOT_SHOW')).not.toBeInTheDocument();
    expect(screen.queryByText('DO_NOT_SHOW_2')).not.toBeInTheDocument();
    expect(screen.queryByText('intention_core')).not.toBeInTheDocument();
    expect(screen.queryByText('semantic_core')).not.toBeInTheDocument();
  });
});
