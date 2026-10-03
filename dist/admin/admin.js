// Jev allowlist console. Signing in exchanges the password for a short-lived session
// token that lives in sessionStorage only. The password itself is never stored, and
// every value from the proxy is written with textContent, never as markup.
const PROXY = "https://cheekpouch-jev-proxy.2607--heek-ouch.workers.dev";
const KEY = "cheekpouch-admin-session";
const MESSAGES = {
  invalid_password: "비밀번호가 올바르지 않습니다.",
  login_locked:
    "시도가 너무 많아 잠시 막혔습니다. 잠시 후 다시 시도해 주세요.",
  weak_password:
    "새 비밀번호는 10자 이상이어야 하며 초기 비밀번호나 현재 비밀번호와 달라야 합니다.",
  password_change_required: "먼저 비밀번호를 바꿔 주세요.",
  unauthorized: "로그인이 끝났습니다. 다시 로그인해 주세요.",
  invalid_request:
    "입력을 확인해 주세요. 이메일 형식과 한도(0~1000)가 맞아야 합니다.",
  allowlist_limit: "허용 목록은 해제된 계정을 포함해 최대 200개입니다.",
  service_not_configured: "프록시 설정이 끝나지 않았습니다.",
  service_unavailable:
    "프록시가 응답하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  network: "프록시에 연결하지 못했습니다. 네트워크를 확인해 주세요.",
};

const $ = (id) => document.getElementById(id);
const notice = $("notice");
let session = "";
try {
  session = sessionStorage.getItem(KEY) ?? "";
} catch {
  session = "";
}

function say(text, tone) {
  notice.hidden = text === "";
  notice.textContent = text;
  if (tone) notice.dataset.tone = tone;
  else delete notice.dataset.tone;
}

function remember(value) {
  session = value;
  try {
    if (value) sessionStorage.setItem(KEY, value);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Without storage the session simply lasts until the tab reloads.
  }
}

async function call(path, body, { authenticated = true } = {}) {
  let response;
  try {
    response = await fetch(`${PROXY}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        ...(authenticated ? { Authorization: `Bearer ${session}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
    });
  } catch {
    throw new Error("network");
  }
  let value = {};
  try {
    value = await response.json();
  } catch {
    value = {};
  }
  if (!response.ok) throw new Error(value.error ?? "service_unavailable");
  return value;
}

/** One screen at a time: sign in, change the password, or the allowlist console. */
function show(screen) {
  $("login").hidden = screen !== "login";
  $("password-form").hidden = screen !== "password";
  $("console").hidden = screen !== "console";
}

function fail(error) {
  const code = error instanceof Error ? error.message : "service_unavailable";
  if (code === "unauthorized") {
    remember("");
    show("login");
  }
  say(MESSAGES[code] ?? MESSAGES.service_unavailable, "error");
}

function cell(row, text) {
  const td = row.insertCell();
  td.textContent = text;
  return td;
}

function render(accounts) {
  const body = $("rows");
  body.replaceChildren();
  $("empty").hidden = accounts.length > 0;
  const active = accounts.filter((account) => account.enabled).length;
  $("count").textContent = `(허용 ${active} / 전체 ${accounts.length})`;
  for (const account of accounts) {
    const row = body.insertRow();
    row.dataset.enabled = String(account.enabled);
    cell(row, account.email).title = account.email;
    const state = cell(row, "");
    const badge = document.createElement("span");
    badge.className = "admin-badge";
    badge.dataset.on = String(account.enabled);
    badge.textContent = account.enabled ? "허용" : "해제됨";
    state.append(badge);
    cell(row, account.linked ? "로그인함" : "아직 안 함");
    cell(row, String(account.devices));
    cell(row, String(account.requestsToday));
    const limit = document.createElement("input");
    limit.type = "number";
    limit.min = "0";
    limit.max = "1000";
    limit.step = "1";
    limit.value = String(account.deviceDailyLimit);
    limit.setAttribute("aria-label", `${account.email} 기기당 하루 한도`);
    cell(row, "").append(limit);
    const actions = cell(row, "");
    actions.className = "admin-actions";
    const save = button("한도 저장", () =>
      change(account.email, Number(limit.value), account.enabled, save),
    );
    const toggle = button(
      account.enabled ? "해제" : "다시 허용",
      () => change(account.email, Number(limit.value), !account.enabled, toggle),
      account.enabled ? "admin-button--danger" : "admin-button--primary",
    );
    actions.append(save, toggle);
  }
}

function button(label, onClick, extra) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `admin-button${extra ? ` ${extra}` : ""}`;
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

async function load() {
  const value = await call("/admin/allowlist");
  render(Array.isArray(value.accounts) ? value.accounts : []);
  show("console");
}

/** Opens whichever screen the session calls for. */
async function enter() {
  const state = await call("/admin/session");
  if (state.mustChange === true) {
    $("password-title").textContent = "비밀번호를 정해 주세요";
    $("password-lead").textContent =
      "지금은 초기 비밀번호입니다. 새 비밀번호(10자 이상)로 바꾸기 전에는 다른 기능을 쓸 수 없습니다.";
    $("password-cancel").hidden = true;
    show("password");
    return;
  }
  await load();
}

async function change(email, deviceDailyLimit, enabled, control) {
  if (control) control.disabled = true;
  try {
    await call("/admin/allowlist", { email, deviceDailyLimit, enabled });
    await load();
    say(
      enabled
        ? `${email}을(를) 허용했습니다. 앱에서 다시 로그인하면 연결됩니다.`
        : `${email}의 허용을 해제했습니다. 해당 앱은 다음 요청부터 Jev를 쓸 수 없습니다.`,
      "ok",
    );
  } catch (error) {
    fail(error);
  } finally {
    if (control) control.disabled = false;
  }
}

$("login").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("password");
  const submit = event.submitter;
  if (submit) submit.disabled = true;
  try {
    const value = await call(
      "/admin/login",
      { password: input.value },
      { authenticated: false },
    );
    input.value = "";
    if (typeof value.session !== "string") throw new Error("service_unavailable");
    remember(value.session);
    say("", "");
    await enter();
  } catch (error) {
    input.value = "";
    fail(error);
  } finally {
    if (submit) submit.disabled = false;
  }
});

$("password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const current = $("current-password");
  const next = $("new-password");
  const confirm = $("confirm-password");
  if (next.value !== confirm.value) {
    say("새 비밀번호 두 칸이 서로 다릅니다.", "error");
    return;
  }
  const submit = event.submitter;
  if (submit) submit.disabled = true;
  try {
    await call("/admin/password", {
      currentPassword: current.value,
      newPassword: next.value,
    });
    say("비밀번호를 바꿨습니다. 다른 로그인은 모두 끝났습니다.", "ok");
    await load();
  } catch (error) {
    fail(error);
  } finally {
    for (const field of [current, next, confirm]) field.value = "";
    if (submit) submit.disabled = false;
  }
});

$("password-cancel").addEventListener("click", () => {
  for (const id of ["current-password", "new-password", "confirm-password"])
    $(id).value = "";
  show("console");
});

$("change-password").addEventListener("click", () => {
  $("password-title").textContent = "비밀번호 변경";
  $("password-lead").textContent =
    "새 비밀번호는 10자 이상이어야 하며 초기 비밀번호나 현재 비밀번호와 달라야 합니다. 변경하면 다른 로그인은 모두 끝납니다.";
  $("password-cancel").hidden = false;
  say("", "");
  show("password");
  $("current-password").focus();
});

$("add").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("email");
  await change(
    email.value.trim().toLowerCase(),
    Number($("limit").value),
    true,
    event.submitter,
  );
  email.value = "";
});

$("refresh").addEventListener("click", () => {
  load().then(
    () => say("", ""),
    (error) => fail(error),
  );
});

$("logout").addEventListener("click", async () => {
  try {
    await call("/admin/logout", {});
  } catch {
    // The server drops idle sessions anyway; the local state is cleared regardless.
  }
  remember("");
  $("rows").replaceChildren();
  show("login");
  say("로그아웃했습니다.", "ok");
});

if (session) {
  enter().catch((error) => fail(error));
} else {
  show("login");
}
