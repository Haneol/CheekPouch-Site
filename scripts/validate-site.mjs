// Static checks for the public site. No dependencies; run with `node scripts/validate-site.mjs`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../dist/", import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/u,
  "$1",
);
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

function* files(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

const pages = [...files(root)].filter((path) => path.endsWith(".html"));
check(
  pages.length >= 6,
  "expected landing, docs, history, privacy, terms and admin pages",
);
for (const path of pages) {
  const html = readFileSync(path, "utf8");
  const name = path.slice(root.length).replaceAll("\\", "/");
  check(/<title>[^<]+<\/title>/u.test(html), `${name}: missing <title>`);
  check(!/<script[^>]+src=["']https?:/u.test(html), `${name}: external script`);
  check(!/<link[^>]+href=["']http:/u.test(html), `${name}: http stylesheet`);
}

const admin = readFileSync(join(root, "admin/index.html"), "utf8");
check(/name="robots"[^>]*noindex/u.test(admin), "admin: missing noindex");

const config = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
);
const adminHeaders = config.headers.find(
  (entry) => entry.source === "/admin/:path*",
);
const csp =
  adminHeaders?.headers.find((h) => h.key === "Content-Security-Policy")
    ?.value ?? "";
const proxy = /const PROXY = "(https:\/\/[^"]+)"/u.exec(
  readFileSync(join(root, "admin/admin.js"), "utf8"),
)?.[1];
check(proxy !== undefined, "admin.js: PROXY constant not found");
check(
  csp.includes(`connect-src ${proxy}`) && !/connect-src[^;]*\*/u.test(csp),
  "admin CSP connect-src must be exactly the proxy origin",
);
check(
  /script-src 'self'/u.test(csp),
  "admin CSP must restrict scripts to 'self'",
);

const releases = JSON.parse(readFileSync(join(root, "releases.json"), "utf8"));
const latest = releases.releases?.[0];
check(
  latest !== undefined &&
    /^alpha-\d+\.\d+\.\d+$/u.test(latest.version) &&
    latest.version === `alpha-${latest.appVersion}` &&
    /^\d{4}-\d{2}-\d{2}$/u.test(latest.date) &&
    latest.features?.length > 0 &&
    latest.fixes?.length > 0,
  "releases.json: first entry is malformed",
);

if (failures.length > 0) {
  console.error(failures.map((message) => `- ${message}`).join("\n"));
  process.exit(1);
}
console.log(`site ok: ${pages.length} pages, latest ${latest.version}`);
