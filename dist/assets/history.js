const releaseList = document.querySelector("[data-release-list]");

function appendTextElement(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  if (className !== "") element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function validStringList(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" && item !== "")
  );
}

function validRelease(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.version === "string" &&
    /^alpha-\d+\.\d+\.\d+$/u.test(value.version) &&
    typeof value.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/u.test(value.date) &&
    value.channel === "alpha" &&
    typeof value.summary === "string" &&
    value.summary !== "" &&
    validStringList(value.features) &&
    validStringList(value.fixes)
  );
}

function appendList(parent, items) {
  const list = document.createElement("ul");
  for (const item of items) appendTextElement(list, "li", "", item);
  parent.append(list);
}

function releaseEntry(release) {
  const article = document.createElement("article");
  article.className = "release-entry";

  const rail = document.createElement("div");
  rail.className = "release-rail";
  rail.setAttribute("aria-hidden", "true");
  rail.append(document.createElement("span"));
  article.append(rail);

  const content = document.createElement("div");
  content.className = "release-content";
  const header = document.createElement("header");
  const headingGroup = document.createElement("div");
  appendTextElement(headingGroup, "p", "release-date", release.date);
  appendTextElement(headingGroup, "h2", "", release.version);
  header.append(headingGroup);
  appendTextElement(header, "span", "channel-badge", release.channel);
  content.append(header);
  appendTextElement(content, "p", "release-summary", release.summary);

  const columns = document.createElement("div");
  columns.className = "release-columns";
  const features = document.createElement("section");
  appendTextElement(features, "h3", "", "새 기능");
  appendList(features, release.features);
  const fixes = document.createElement("section");
  appendTextElement(fixes, "h3", "", "수정");
  appendList(fixes, release.fixes);
  columns.append(features, fixes);
  content.append(columns);
  article.append(content);
  return article;
}

async function loadHistory() {
  if (releaseList === null) return;
  try {
    const response = await fetch("../releases.json", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return;
    const payload = await response.json();
    if (!Array.isArray(payload?.releases)) return;
    const releases = payload.releases.filter(validRelease);
    if (releases.length === 0) return;
    releaseList.replaceChildren(...releases.map(releaseEntry));
  } catch {
    // Keep the embedded latest release when the JSON request is unavailable.
  }
}

void loadHistory();
