import fs from 'fs';
import path from 'path';

const TOKENS_DIR = path.resolve(process.cwd(), 'tokens');
const servicePhoneBySession: Record<string, string> = {};

function safeSessionFileName(session: string) {
  return String(session).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function normalizeDigits(value: any) {
  return String(value || '').replace(/\D/g, '');
}

function servicePhoneFilePath(session: string) {
  return path.join(TOKENS_DIR, `${safeSessionFileName(session)}.chatwoot-service.json`);
}

function tokenFilePath(session: string) {
  return path.join(TOKENS_DIR, `${safeSessionFileName(session)}.data.json`);
}

function readPhoneFromTokenFile(session: string): string | undefined {
  try {
    const p = tokenFilePath(session);
    if (!fs.existsSync(p)) return undefined;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const phone =
      data?.config?.chatWoot?.mobile_number || data?.config?.mobile_number;
    const digits = normalizeDigits(phone);
    return digits || undefined;
  } catch {
    return undefined;
  }
}

function readServiceFile(session: string): Record<string, unknown> | undefined {
  try {
    const p = servicePhoneFilePath(session);
    if (!fs.existsSync(p)) return undefined;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function readPhoneFromServiceFile(session: string): string | undefined {
  try {
    const data = readServiceFile(session);
    if (!data) return undefined;
    let digits = normalizeDigits(data.mobile_number);
    if (!digits && data.startSessionBody && typeof data.startSessionBody === 'object') {
      const b = data.startSessionBody as Record<string, unknown>;
      const cw = b.chatWoot as Record<string, unknown> | undefined;
      digits = normalizeDigits(cw?.mobile_number ?? b.mobile_number);
    }
    return digits || undefined;
  } catch {
    return undefined;
  }
}

export function persistChatWootStartBody(session: string, body: any) {
  if (!session || !body?.chatWoot) return;
  const digits = normalizeDigits(
    body.chatWoot?.mobile_number ?? body.mobile_number
  );
  if (!digits) return;
  try {
    if (!fs.existsSync(TOKENS_DIR)) {
      fs.mkdirSync(TOKENS_DIR, { recursive: true });
    }
    const existing = readServiceFile(session) || {};
    const payload = {
      ...existing,
      mobile_number: digits,
      startSessionBody: JSON.parse(JSON.stringify(body)),
    };
    fs.writeFileSync(
      servicePhoneFilePath(session),
      JSON.stringify(payload),
      'utf8'
    );
  } catch {
    // ignore disk errors
  }
}

export function getChatWootStartBodyFromDisk(session: string): any | undefined {
  try {
    const data = readServiceFile(session);
    const b = data?.startSessionBody as any;
    if (b && typeof b === 'object' && b.chatWoot) return b;
    const p = tokenFilePath(session);
    if (!fs.existsSync(p)) return undefined;
    const tokenData = JSON.parse(fs.readFileSync(p, 'utf8'));
    const cfg = tokenData?.config;
    if (cfg && typeof cfg === 'object' && cfg.chatWoot) return cfg;
    return undefined;
  } catch {
    return undefined;
  }
}

export function setChatWootServicePhone(session: string, phone: string | undefined) {
  if (!session || !phone) return;
  const digits = normalizeDigits(phone);
  if (!digits) return;
  servicePhoneBySession[session] = digits;
  try {
    if (!fs.existsSync(TOKENS_DIR)) {
      fs.mkdirSync(TOKENS_DIR, { recursive: true });
    }
    const existing = readServiceFile(session) || {};
    fs.writeFileSync(
      servicePhoneFilePath(session),
      JSON.stringify({ ...existing, mobile_number: digits }),
      'utf8'
    );
  } catch {
    // ignore disk errors
  }
}

export function getChatWootServicePhone(session: string): string | undefined {
  if (servicePhoneBySession[session]) return servicePhoneBySession[session];
  const fromServiceFile = readPhoneFromServiceFile(session);
  if (fromServiceFile) {
    servicePhoneBySession[session] = fromServiceFile;
    return fromServiceFile;
  }
  const fromToken = readPhoneFromTokenFile(session);
  if (fromToken) {
    setChatWootServicePhone(session, fromToken);
    return servicePhoneBySession[session];
  }
  return undefined;
}
