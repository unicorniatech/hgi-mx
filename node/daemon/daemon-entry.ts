import { daemonCore, loadDaemonNodeConfigFromEnv } from './daemon-core';

async function main(): Promise<void> {
  const config = loadDaemonNodeConfigFromEnv();
  await daemonCore.start(config);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
