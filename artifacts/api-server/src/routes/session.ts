import { Router } from "express";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Api } from "telegram";
import { StartSessionBody, VerifySessionBody, Verify2FABody } from "@workspace/api-zod";
import { randomUUID } from "crypto";

const router = Router();

interface PendingSession {
  client: TelegramClient;
  phoneNumber: string;
  phoneCodeHash: string;
  apiId: number;
  apiHash: string;
  createdAt: number;
}

const pendingSessions = new Map<string, PendingSession>();

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of pendingSessions.entries()) {
    if (now - session.createdAt > 10 * 60 * 1000) {
      session.client.disconnect().catch(() => {});
      pendingSessions.delete(id);
    }
  }
}, 60 * 1000);

/**
 * Decode a GramJS StringSession string into { dcId, authKey }.
 * Format: "1" + base64url([dcId(1)] + [addrLen(2 BE)] + [addr] + [port(2)] + [key(256)])
 */
function decodeGramJsSession(saved: string): { dcId: number; authKey: Buffer } {
  if (!saved || saved[0] !== "1") throw new Error("Unsupported session version");
  const raw = Buffer.from(saved.slice(1), "base64url");
  const dcId = raw.readUInt8(0);
  const addrLen = raw.readUInt16BE(1);
  const keyOffset = 1 + 2 + addrLen + 2; // dcId + addrLen + addr + port
  if (raw.length < keyOffset + 256) throw new Error("Session data too short");
  const authKey = raw.subarray(keyOffset, keyOffset + 256);
  return { dcId, authKey: Buffer.from(authKey) };
}

function buildPyrogramSession(
  dcId: number,
  apiId: number,
  authKey: Buffer,
  testMode = false
): string {
  const buf = Buffer.alloc(1 + 4 + 1 + 256);
  buf.writeUInt8(dcId, 0);
  buf.writeUInt32BE(apiId, 1);
  buf.writeUInt8(testMode ? 1 : 0, 5);
  authKey.copy(buf, 6, 0, 256);
  return buf.toString("base64url");
}

function getSessionString(client: TelegramClient, apiId: number): string {
  const saved = (client.session as StringSession).save();
  if (!saved) throw new Error("Session not ready — auth key missing");
  const { dcId, authKey } = decodeGramJsSession(saved);
  return buildPyrogramSession(dcId, apiId, authKey);
}

router.post("/session/start", async (req, res) => {
  const parsed = StartSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const { api_id, api_hash, phone_number } = parsed.data;

  try {
    const client = new TelegramClient(new StringSession(""), api_id, api_hash, {
      connectionRetries: 3,
      useWSS: false,
    });

    await client.connect();

    const result = await client.sendCode(
      { apiId: api_id, apiHash: api_hash },
      phone_number
    );

    const sessionId = randomUUID();
    pendingSessions.set(sessionId, {
      client,
      phoneNumber: phone_number,
      phoneCodeHash: result.phoneCodeHash,
      apiId: api_id,
      apiHash: api_hash,
      createdAt: Date.now(),
    });

    res.json({ session_id: sessionId, phone_code_hash: result.phoneCodeHash });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to connect to Telegram";
    req.log.error({ err }, "Failed to start session");
    res.status(400).json({ error: msg });
  }
});

router.post("/session/verify", async (req, res) => {
  const parsed = VerifySessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const { session_id, phone_code } = parsed.data;
  const pending = pendingSessions.get(session_id);

  if (!pending) {
    res.status(400).json({ error: "Session not found or expired. Please start again." });
    return;
  }

  try {
    await pending.client.invoke(
      new Api.auth.SignIn({
        phoneNumber: pending.phoneNumber,
        phoneCodeHash: pending.phoneCodeHash,
        phoneCode: phone_code,
      })
    );

    const stringSession = getSessionString(pending.client, pending.apiId);

    await pending.client.disconnect();
    pendingSessions.delete(session_id);

    res.json({ needs_2fa: false, string_session: stringSession, hint: null });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Verification failed";

    if (msg.includes("SESSION_PASSWORD_NEEDED") || msg.includes("two-steps")) {
      res.json({ needs_2fa: true, string_session: null, hint: null });
      return;
    }

    req.log.error({ err }, "Failed to verify session");
    res.status(400).json({ error: msg });
  }
});

router.post("/session/2fa", async (req, res) => {
  const parsed = Verify2FABody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const { session_id, password } = parsed.data;
  const pending = pendingSessions.get(session_id);

  if (!pending) {
    res.status(400).json({ error: "Session not found or expired. Please start again." });
    return;
  }

  try {
    await pending.client.signInWithPassword(
      { apiId: pending.apiId, apiHash: pending.apiHash },
      { password: async () => password, onError: async () => false }
    );

    const stringSession = getSessionString(pending.client, pending.apiId);

    await pending.client.disconnect();
    pendingSessions.delete(session_id);

    req.log.info({ sessionLength: stringSession.length, sessionPreview: stringSession.slice(0, 10) }, "2FA session generated");
    res.json({ needs_2fa: false, string_session: stringSession, hint: null });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "2FA verification failed";
    req.log.error({ err }, "Failed to verify 2FA");
    res.status(400).json({ error: msg });
  }
});

export default router;
