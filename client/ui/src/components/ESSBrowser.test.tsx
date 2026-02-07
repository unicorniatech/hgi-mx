import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import ESSBrowser from './ESSBrowser';

type MockResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

describe('ESSBrowser', () => {
  it('renders and offers synthetic audio playback without rendering raw audio base64', async () => {
    const bundleId = 'b1';
    const list = [bundleId];
    const bundle = {
      shard_id: bundleId,
      shard_hash: 'a'.repeat(64),
      ulx_state_id: 'ulx_1234',
      created_at_ms: Date.now(),
      expires_at_ms: Date.now() + 60_000,
      synthetic_audio: 'AQID',
      emotional_timeline: [{ t_ms: 0, channel: 'ev_0', value: 0.1 }],
      scene_tags: ['tag1'],
    };

    const fetchMock = vi.fn(async (url: string) => {
      const body = url === '/api/ess' ? JSON.stringify(list) : JSON.stringify(bundle);
      const res: MockResponse = { ok: true, status: 200, text: async () => body };
      return res as any;
    });
    vi.stubGlobal('fetch', fetchMock as any);

    render(
      <MemoryRouter initialEntries={[`/ess/${bundleId}`]}>
        <ESSBrowser id={bundleId} />
      </MemoryRouter>,
    );

    await screen.findByText('ESS Browser');
    const hits = await screen.findAllByText(bundleId);
    expect(hits.length).toBeGreaterThan(0);

    expect(screen.queryByText(bundle.synthetic_audio)).not.toBeInTheDocument();

    const btn = await screen.findByRole('button', { name: 'Play' });
    fireEvent.click(btn);

    const maybePlaying = await screen.findByRole('button', { name: /play/i });
    expect(maybePlaying).toBeDisabled();
  });
});
