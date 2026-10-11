#!/usr/bin/env node
// One-time Gmail consent for the purchase-mail sync (read-only scope).
//
// 1. Google Cloud Console → APIs & Services: enable "Gmail API", create an
//    OAuth client of type "Desktop app".
// 2. Put its id and secret in .dev.vars:
//      GMAIL_CLIENT_ID=...
//      GMAIL_CLIENT_SECRET=...
// 3. Run `node scripts/gmail-auth.mjs`, sign in, allow.
// The refresh token is written to .dev.vars as GMAIL_REFRESH_TOKEN and never
// printed. Restart the server afterwards so it reads the new value.
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VARS = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".dev.vars");
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

function readVars() {
  try {
    return readFileSync(VARS, "utf8");
  } catch {
    return "";
  }
}

const vars = readVars();
const get = (name) => vars.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim();
const clientId = get("GMAIL_CLIENT_ID");
const clientSecret = get("GMAIL_CLIENT_SECRET");
if (!clientId || !clientSecret) {
  console.error("먼저 .dev.vars에 GMAIL_CLIENT_ID와 GMAIL_CLIENT_SECRET을 넣어 주세요 (스크립트 상단 설명 참고).");
  process.exit(1);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (!code && !error) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  if (error) {
    response.end("<p>권한 허용이 취소되었습니다. 창을 닫아 주세요.</p>");
    console.error(`동의 실패: ${error}`);
    server.close();
    process.exitCode = 1;
    return;
  }
  try {
    const token = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    }).then((res) => res.json());
    if (!token.refresh_token) throw new Error(token.error_description || token.error || "refresh_token 없음");
    const current = readVars();
    const line = `GMAIL_REFRESH_TOKEN=${token.refresh_token}`;
    const next = /^GMAIL_REFRESH_TOKEN=.*$/m.test(current) ? current.replace(/^GMAIL_REFRESH_TOKEN=.*$/m, line) : `${current.replace(/\n?$/, "\n")}${line}\n`;
    writeFileSync(VARS, next, { mode: 0o600 });
    response.end("<p>책갈피 Gmail 연동이 완료되었습니다. 이 창을 닫아도 됩니다.</p>");
    console.log("완료: .dev.vars에 GMAIL_REFRESH_TOKEN을 저장했습니다. 서버를 재시작하세요:");
    console.log("  launchctl kickstart -k gui/$(id -u)/com.bookscout.server");
  } catch (caught) {
    response.end("<p>토큰 교환에 실패했습니다. 터미널을 확인해 주세요.</p>");
    console.error(`토큰 교환 실패: ${caught.message}`);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

let redirectUri = "";
server.listen(0, "127.0.0.1", () => {
  redirectUri = `http://127.0.0.1:${server.address().port}`;
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  }).toString();
  console.log("브라우저에서 Google 계정으로 로그인하고 '읽기 전용' 권한을 허용하세요.");
  console.log(auth.toString());
  execFile("open", [auth.toString()], () => {});
});
