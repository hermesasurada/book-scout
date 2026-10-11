// Minimal Gmail API client (read-only scope). OAuth client id/secret and the
// refresh token live only in .dev.vars; see scripts/gmail-auth.mjs.

export type GmailConfig = { clientId?: string; clientSecret?: string; refreshToken?: string };

export function gmailConfigured(config: GmailConfig): config is Required<GmailConfig> {
  return Boolean(config.clientId && config.clientSecret && config.refreshToken);
}

export async function gmailAccessToken(config: Required<GmailConfig>): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = (await response.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(`Gmail 인증 실패: ${data.error_description || data.error || response.status}`);
  }
  return data.access_token;
}

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export async function listMessageIds(token: string, query: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ q: query, maxResults: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`${API}/messages?${params}`, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Gmail 목록 조회 실패 (${response.status})`);
    const data = (await response.json()) as { messages?: Array<{ id: string }>; nextPageToken?: string };
    ids.push(...(data.messages ?? []).map((message) => message.id));
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);
  return ids;
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[]; headers?: Array<{ name: string; value: string }> };

function decodeBase64Url(data: string) {
  const binary = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function findPart(part: Part, mimeType: string): Part | null {
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

export type GmailMessage = { id: string; subject: string; html: string; date: string };

export async function getMessage(token: string, id: string): Promise<GmailMessage> {
  const response = await fetch(`${API}/messages/${id}?format=full`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Gmail 메일 조회 실패 (${response.status})`);
  const data = (await response.json()) as { id: string; internalDate?: string; payload: Part };
  const subject = data.payload.headers?.find((header) => header.name.toLowerCase() === "subject")?.value ?? "";
  const part = findPart(data.payload, "text/html") ?? findPart(data.payload, "text/plain");
  const html = part?.body?.data ? decodeBase64Url(part.body.data) : "";
  // Fallback purchase date: the day the mail arrived (KST).
  const arrived = new Date(Number(data.internalDate ?? Date.now()) + 9 * 3600 * 1000);
  return { id: data.id, subject, html, date: arrived.toISOString().slice(0, 10) };
}
