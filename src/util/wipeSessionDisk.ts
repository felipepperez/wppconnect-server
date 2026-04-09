import fs from 'fs';
import path from 'path';

export async function closeWppClientIfPresent(
  client: any,
  logger: { error: (e: unknown) => void }
): Promise<void> {
  if (!client) return;
  try {
    if (typeof client.close === 'function') {
      await client.close();
      return;
    }
    const browser = client.page?.browser?.();
    if (browser && typeof browser.close === 'function') {
      await browser.close();
    }
  } catch (e) {
    logger.error(e);
  }
}

export async function wipeSessionDiskData(
  session: string,
  customUserDataDir?: string | null
): Promise<void> {
  const targets: string[] = [];
  if (customUserDataDir) {
    targets.push(path.resolve(process.cwd(), customUserDataDir, session));
  }
  targets.push(
    path.resolve(process.cwd(), 'tokens', `${session}.data.json`),
    path.resolve(process.cwd(), 'tokens', session)
  );

  for (const targetPath of targets) {
    if (fs.existsSync(targetPath)) {
      await fs.promises.rm(targetPath, {
        recursive: true,
        maxRetries: 5,
        force: true,
        retryDelay: 1000,
      });
    }
  }
}
