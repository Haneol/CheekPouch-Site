// ---------------------------------------------------------------------------
// Release source. Change the repository, installer pattern or store link HERE ONLY.
// electron-builder names the installer `CheekPouch-Setup-${version}-${arch}.${ext}`
// (desktop/package.json build.artifactName).
// ---------------------------------------------------------------------------
const RELEASE_REPO = "Haneol/CheekPouch-Site";
const ASSET_PATTERN = /^CheekPouch-Setup-.+-x64\.exe$/u;
const RELEASES_PAGE = `https://github.com/${RELEASE_REPO}/releases`;
const LATEST_API = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;
const DOWNLOAD_PREFIX = `https://github.com/${RELEASE_REPO}/releases/download/`;
// Google Play listing. Set to the listing URL once the app is published; it must
// start with https://play.google.com/store/apps/details?id= (checked before use).
// While it is null, phones see a disabled "출시 예정" control and no link at all.
const PLAY_STORE_URL = null;
const PLAY_STORE_PREFIX = "https://play.google.com/store/apps/details?id=";

const REQUEST_TIMEOUT_MS = 8000;
const CACHE_KEY = "cheekpouch.latest-release.v1";
const CACHE_TTL_MS = 10 * 60 * 1000;

const TAG_PATTERN = /^[A-Za-z0-9._+-]{1,64}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/iu;
const MAX_BODY_CHARS = 20000;
const MAX_NOTE_CHARS = 200;

const MESSAGES = {
  loading: "최신 버전을 확인하는 중…",
  none: "아직 내려받을 수 있는 설치 파일이 없습니다. 상단 버튼의 GitHub Releases에서 확인해 주세요.",
  error:
    "최신 버전을 불러오지 못했습니다. 상단 버튼으로 GitHub Releases에서 직접 받을 수 있습니다.",
  rate: "요청이 많아 최신 버전을 확인하지 못했습니다. 잠시 후 다시 시도하거나 상단 버튼의 GitHub Releases에서 직접 받아 주세요.",
  offline:
    "이 화면에서는 최신 버전을 확인할 수 없습니다. 인터넷에 연결된 브라우저에서 이 페이지를 열어 주세요.",
};

const PLATFORM_NOTICES = {
  androidSoon:
    "Android 앱은 Google Play로 출시될 예정입니다. Windows 설치 파일은 PC에서 이 페이지를 열어 받아 주세요.",
  androidLive:
    "Android 앱은 Google Play에서 설치할 수 있습니다. 상단 버튼으로 이동하세요. Windows 설치 파일은 PC에서 받을 수 있습니다.",
  ios: "iPhone·iPad용 앱은 아직 준비 중입니다. Windows 설치 파일은 PC에서 이 페이지를 열어 받아 주세요.",
};

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Pick the download target for this device. Pure, so it can be unit-tested.
 * `uaData` is `navigator.userAgentData` when the browser has it, else undefined.
 * Returns "windows" (installer; every non-phone device), "android" or "ios".
 */
export function chooseTarget(userAgent, uaData) {
  const ua = typeof userAgent === "string" ? userAgent : "";
  if (/iPhone|iPad|iPod/iu.test(ua)) return "ios";
  if (/Android/iu.test(ua)) return "android";
  if (isRecord(uaData) && uaData.mobile === true) return "android";
  return "windows";
}

/** Only a Google Play listing URL is ever used as the mobile link. */
export function isPlayStoreUrl(value) {
  if (typeof value !== "string" || !value.startsWith(PLAY_STORE_PREFIX)) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "play.google.com" &&
      url.username === "" &&
      url.password === "" &&
      /^[A-Za-z][\w.]*$/u.test(url.searchParams.get("id") ?? "")
    );
  } catch {
    return false;
  }
}

/** Only a plain https github.com URL under this repo's release downloads. */
function isTrustedDownloadUrl(value) {
  if (typeof value !== "string" || !value.startsWith(DOWNLOAD_PREFIX)) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.username === "" &&
      url.password === "" &&
      url.href.startsWith(DOWNLOAD_PREFIX)
    );
  } catch {
    return false;
  }
}

function validIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function cleanLine(line) {
  return line
    .replace(/[`*_#>|]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_NOTE_CHARS);
}

/** Pull a published SHA-256 for this asset out of the release notes, if any. */
function findSha256(body, assetName) {
  const labelled = /sha-?256\W{0,16}([a-f0-9]{64})/iu.exec(body);
  if (labelled !== null) return labelled[1].toLowerCase();
  for (const line of body.split(/\r?\n/u)) {
    if (!line.includes(assetName)) continue;
    const hash = /\b([a-f0-9]{64})\b/iu.exec(line);
    if (hash !== null) return hash[1].toLowerCase();
  }
  return null;
}

/** First release-note line that talks about signing, if any. */
function findSignatureNote(body) {
  for (const line of body.split(/\r?\n/u)) {
    if (/서명|authenticode|code[\s-]?sign|signature/iu.test(line)) {
      const cleaned = cleanLine(line);
      if (cleaned !== "") return cleaned;
    }
  }
  return null;
}

/**
 * Validate the GitHub "latest release" payload defensively and reduce it to the
 * few fields the page shows. Returns null when no usable installer is present.
 */
export function parseRelease(payload) {
  if (!isRecord(payload)) return null;
  const tag = payload.tag_name;
  if (typeof tag !== "string" || !TAG_PATTERN.test(tag)) return null;
  if (!Array.isArray(payload.assets)) return null;

  const asset = payload.assets.find(
    (item) =>
      isRecord(item) &&
      typeof item.name === "string" &&
      ASSET_PATTERN.test(item.name) &&
      typeof item.size === "number" &&
      Number.isFinite(item.size) &&
      item.size > 0 &&
      isTrustedDownloadUrl(item.browser_download_url),
  );
  if (asset === undefined) return null;

  const body =
    typeof payload.body === "string"
      ? payload.body.slice(0, MAX_BODY_CHARS)
      : "";
  return {
    tag,
    publishedAt: validIsoDate(payload.published_at),
    size: asset.size,
    url: asset.browser_download_url,
    sha256: findSha256(body, asset.name),
    signatureNote: findSignatureNote(body),
  };
}

function isStoredRelease(value) {
  return (
    isRecord(value) &&
    typeof value.tag === "string" &&
    TAG_PATTERN.test(value.tag) &&
    (value.publishedAt === null || validIsoDate(value.publishedAt) !== null) &&
    typeof value.size === "number" &&
    Number.isFinite(value.size) &&
    value.size > 0 &&
    isTrustedDownloadUrl(value.url) &&
    (value.sha256 === null ||
      (typeof value.sha256 === "string" && SHA256_PATTERN.test(value.sha256))) &&
    (value.signatureNote === null ||
      (typeof value.signatureNote === "string" &&
        value.signatureNote.length <= MAX_NOTE_CHARS))
  );
}

function readCache() {
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (raw === null) return null;
    const stored = JSON.parse(raw);
    if (
      !isRecord(stored) ||
      typeof stored.savedAt !== "number" ||
      Date.now() - stored.savedAt > CACHE_TTL_MS ||
      Date.now() < stored.savedAt ||
      !isStoredRelease(stored.release)
    ) {
      return null;
    }
    return stored.release;
  } catch {
    return null;
  }
}

function writeCache(release) {
  try {
    window.sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), release }),
    );
  } catch {
    // Storage can be unavailable (private mode, blocked); the cache is optional.
  }
}

/** Resolves to { release } or { problem: "none" | "rate" | "error" }. */
async function fetchLatest() {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await window.fetch(LATEST_API, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    if (response.status === 403 || response.status === 429) {
      return { problem: "rate" };
    }
    if (response.status === 404) return { problem: "none" };
    if (!response.ok) return { problem: "error" };
    const release = parseRelease(await response.json());
    return release === null ? { problem: "none" } : { release };
  } catch {
    return { problem: "error" };
  } finally {
    window.clearTimeout(timer);
  }
}

function formatSize(bytes) {
  const mib = bytes / (1024 * 1024);
  if (mib >= 1) return `${mib.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(iso) {
  const date = new Date(iso);
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function setText(element, text) {
  if (element !== null) element.textContent = text;
}

function setHidden(element, hidden) {
  if (element !== null) element.hidden = hidden;
}

// ----- the single top-bar download control -------------------------------

function createButton() {
  const link = document.querySelector("[data-download-link]");
  if (link === null) return null;
  return { link, label: link.querySelector("[data-download-label]") ?? link };
}

/** Make the control a normal link. */
function enableButton(button, label, href, state) {
  button.link.setAttribute("href", href);
  button.link.removeAttribute("aria-disabled");
  button.link.dataset.state = state;
  setText(button.label, label);
}

/** Make the control a muted, non-interactive element (no href). */
function disableButton(button, label) {
  button.link.removeAttribute("href");
  button.link.setAttribute("aria-disabled", "true");
  button.link.dataset.state = "disabled";
  setText(button.label, label);
}

function setupMobileButton(button, target) {
  if (target === "android" && isPlayStoreUrl(PLAY_STORE_URL)) {
    enableButton(button, "Google Play에서 받기", PLAY_STORE_URL, "ready");
  } else if (target === "android") {
    disableButton(button, "Google Play 출시 예정");
  } else {
    disableButton(button, "iOS 앱 준비 중");
  }
}

// ----- the informational release panel (install section) ------------------

function createView() {
  const root = document.querySelector("[data-download-root]");
  if (root === null) return null;
  const pick = (selector) => root.querySelector(selector);
  return {
    root,
    status: pick("[data-download-status]"),
    meta: pick("[data-download-meta]"),
    tag: pick("[data-download-tag]"),
    date: pick("[data-download-date]"),
    size: pick("[data-download-size]"),
    extra: pick("[data-download-extra]"),
    signature: pick("[data-download-signature]"),
    hashWrap: pick("[data-download-hash-wrap]"),
    hash: pick("[data-download-hash]"),
  };
}

function showLoading(view, button) {
  view.root.dataset.state = "loading";
  setText(view.status, MESSAGES.loading);
  if (button !== null) enableButton(button, "다운로드", RELEASES_PAGE, "loading");
}

function showUnavailable(view, button, problem) {
  view.root.dataset.state = "unavailable";
  setText(view.status, MESSAGES[problem] ?? MESSAGES.error);
  setHidden(view.meta, true);
  setHidden(view.extra, true);
  // The button keeps pointing at the GitHub Releases page (its no-JS href too).
  if (button !== null) {
    enableButton(button, "Windows용 다운로드", RELEASES_PAGE, "unavailable");
  }
}

function showReady(view, button, release) {
  view.root.dataset.state = "ready";
  setText(view.status, "");
  setText(view.tag, release.tag);
  setText(view.size, formatSize(release.size));
  if (release.publishedAt === null) {
    setText(view.date, "—");
    view.date?.removeAttribute("datetime");
  } else {
    setText(view.date, formatDate(release.publishedAt));
    view.date?.setAttribute("datetime", release.publishedAt);
  }
  setHidden(view.meta, false);

  setText(view.signature, release.signatureNote ?? "");
  setHidden(view.signature, release.signatureNote === null);
  setText(view.hash, release.sha256 ?? "");
  setHidden(view.hashWrap, release.sha256 === null);
  setHidden(
    view.extra,
    release.signatureNote === null && release.sha256 === null,
  );

  if (button !== null) {
    enableButton(button, "Windows용 다운로드", release.url, "ready");
  }
}

/** Phones: no installer is offered; the install section explains instead. */
function showPlatformNotice(target) {
  const root = document.querySelector("[data-install-root]");
  if (root === null) return;
  root.dataset.platform = target;
  const notice = root.querySelector("[data-platform-notice]");
  if (notice === null) return;
  if (target === "ios") {
    notice.textContent = PLATFORM_NOTICES.ios;
  } else {
    notice.textContent = isPlayStoreUrl(PLAY_STORE_URL)
      ? PLATFORM_NOTICES.androidLive
      : PLATFORM_NOTICES.androidSoon;
  }
  notice.hidden = false;
}

/** Desktop: the Android line follows whether the Play listing exists. */
function showAndroidNote() {
  if (!isPlayStoreUrl(PLAY_STORE_URL)) return;
  setText(
    document.querySelector("[data-android-note]"),
    "Android 앱은 Google Play에서 설치할 수 있습니다. 휴대폰에서 이 페이지를 열면 상단 버튼이 Google Play로 연결됩니다.",
  );
}

async function init() {
  const button = createButton();
  const target = chooseTarget(
    window.navigator.userAgent,
    window.navigator.userAgentData,
  );

  if (target !== "windows") {
    if (button !== null) setupMobileButton(button, target);
    showPlatformNotice(target);
    return;
  }
  showAndroidNote();

  const view = createView();
  if (view === null) return;

  if (!["http:", "https:"].includes(window.location.protocol)) {
    showUnavailable(view, button, "offline");
    return;
  }

  const cached = readCache();
  if (cached !== null) {
    showReady(view, button, cached);
    return;
  }

  showLoading(view, button);
  const result = await fetchLatest();
  if (result.release === undefined) {
    showUnavailable(view, button, result.problem);
    return;
  }
  writeCache(result.release);
  showReady(view, button, result.release);
}

if (typeof document !== "undefined") void init();
