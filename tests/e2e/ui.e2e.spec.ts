import { test, expect } from '@playwright/test';

test('routes render and consensus vote works', async ({ page }) => {
  await page.goto('/mesh');
  await expect(page.getByRole('heading', { name: 'Mesh Dashboard' })).toBeVisible();

  await page.goto('/ulx/test123');
  await expect(page.getByRole('heading', { name: 'ULX Packet' })).toBeVisible();

  await page.goto('/consensus');
  await expect(page.getByRole('heading', { name: 'Consensus' })).toBeVisible();

  await page.getByRole('button', { name: 'Upvote' }).click();

  await expect(page.getByText('Votes', { exact: true })).toBeVisible();
});

test('ess waveform renders and play button exists', async ({ page }) => {
  const bundleId = 'bundle_test';

  await page.route('**/api/ess', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([bundleId]),
    });
  });

  await page.route(`**/api/ess/${bundleId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        shard_id: bundleId,
        shard_hash: 'a'.repeat(64),
        ulx_state_id: 'ulx_1234',
        created_at_ms: Date.now(),
        expires_at_ms: Date.now() + 60_000,
        synthetic_audio: 'AQID',
        emotional_timeline: [{ t_ms: 0, channel: 'ev_0', value: 0.1 }],
        scene_tags: ['tag1'],
      }),
    });
  });

  await page.goto(`/ess/${bundleId}`);
  await expect(page.getByRole('heading', { name: 'ESS Browser' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});
