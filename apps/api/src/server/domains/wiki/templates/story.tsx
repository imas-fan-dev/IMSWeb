import { raw } from "hono/html";
import type { WikiMediaFit, WikiStoryCard, WikiStoryCategory } from "@/domains/wiki/models";
import { legacyArtworkForAgency } from "@/domains/wiki/legacy-media";
import { scriptJson } from "@/domains/wiki/templates/shared";

export interface WikiStoryTemplateProps {
  agency: string;
  idol: string;
  idolDisplayName: string;
  categories: WikiStoryCategory[];
  presetCategories: string[];
  avatarUrl: string;
  avatarFit: WikiMediaFit;
  idolColor: string | null;
}

const agencyTheme: Record<string, string> = {
  "765PRO": "#f34f6d", SideM: "#0fbe94", "闪耀色彩": "#8dbbff",
  "灰姑娘女孩": "#2681c8", "百万现场": "#ffc30b", "学园偶像大师": "#f39800",
};

const valivLinks: Record<string, { ytb: string; x: string }> = {
  "灯里爱夏": { ytb: "https://www.youtube.com/@TomoriManaka", x: "https://x.com/TomoriManaka" },
  "上水流宇宙": { ytb: "https://www.youtube.com/@KamizuruCosmo", x: "https://x.com/KamizuruCosmo" },
  "蕾特拉": { ytb: "https://www.youtube.com/@UtagawaLetora", x: "https://x.com/UtagawaLetora" },
};

const specialCardIcons: Record<string, string> = {
  "【W.I.N.G.編】": "/icon/sc/wing.webp",
  "【ファン感謝祭編】": "/icon/sc/fan_festival.webp",
  "【G.R.A.D.編】": "/icon/sc/grad.webp",
  "【Landing Point編】": "/icon/sc/landing_point.webp",
  "【S.T.E.P.編】": "/icon/sc/step.webp",
  "【个人剧情】": "/icon/cg/personal_story.webp",
  "【营业剧情】": "/icon/cg/business_story.webp",
  "【主线剧情个人回】": "/icon/cg/main_story_personal.webp",
};

const sCardFilterNames = ["花海咲季", "月村手毬", "藤田琴音", "有村麻央", "葛城莉莉娅", "仓本千奈", "紫云清夏", "篠泽广", "姬崎莉波", "花海佑芽", "秦谷美铃", "十王星南", "雨夜燕", "舞蹈教练", "声乐教练", "视觉教练", "真城优"];
const sCardFormNames = ["咲季", "手毬", "琴音", "麻央", "莉莉娅", "千奈", "清夏", "广", "莉波", "佑芽", "美铃", "星南", "燕", "舞蹈教练", "声乐教练", "视觉教练", "真城优"];

function safeColor(value: string | null | undefined, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function mlSeasonalIcon(cardName: string) {
  return cardName
    .replace(/[【】]/g, "")
    .replace("万圣节", "halloween_")
    .replace("圣诞节", "christmas_")
    .replace("情人节", "valentine_")
    .replace("新年", "new_year_")
    .replace("白情", "whiteday_")
    .replace("年", "");
}

function StoryCardView(props: {
  agency: string;
  idol: string;
  category: WikiStoryCategory;
  card: WikiStoryCard;
  categoryIndex: number;
  cardIndex: number;
}) {
  const { agency, idol, category, card, categoryIndex, cardIndex } = props;
  const empty = !card.links.length || card.links[0]?.url === "#" || !card.links[0]?.url.trim();
  const cleanName = card.name.replace(/[【】]/g, "").trim().toLocaleLowerCase();
  const valiv = valivLinks[idol];
  const fallbackArtwork = legacyArtworkForAgency(agency);
  if (agency === "765PRO") {
    return (
      <button class={"btn-765pro story-card" + (empty ? " dash-empty" : "")} onclick={`openCardPopup(event, this, ${categoryIndex}, ${cardIndex})`}>
        {card.name}
        {card.subtitle ? <div style="font-size: 12px; font-weight: normal; margin-top: 4px; opacity: 0.8;">{card.subtitle}</div> : null}
      </button>
    );
  }
  if (valiv && cleanName.includes("ytb")) {
    return (
      <div class="card story-card" style="cursor: pointer;" onclick={`window.open(${JSON.stringify(valiv.ytb)}, '_blank', 'noopener')`}>
        <div class="img-wrapper" style="background: #fff; padding: 0;"><img src="/icon/ytb.webp" class="card-img-top loaded" alt="ytb" style="object-fit: cover; width: 100%; height: 100%;" /></div>
        <div class="card-body"><h5 class="card-title">{card.name}</h5></div>
      </div>
    );
  }
  if (valiv && cleanName.includes("x")) {
    return (
      <div class="card story-card" style="cursor: pointer;" onclick={`window.open(${JSON.stringify(valiv.x)}, '_blank', 'noopener')`}>
        <div class="img-wrapper" style="background: #111; padding: 0;"><img src="/icon/x.webp" class="card-img-top loaded" alt="X" style="object-fit: cover; width: 100%; height: 100%;" /></div>
        <div class="card-body"><h5 class="card-title">{card.name}</h5></div>
      </div>
    );
  }
  const seasonal = agency === "百万现场" && ["万圣节", "圣诞节", "情人节", "新年", "白情"].some((term) => card.name.includes(term));
  const classes = ["card", "story-card", empty ? "no-link-card" : "", empty && ["初", "N.I.A", "STEP3"].includes(category.name) ? "dash-empty" : ""].filter(Boolean).join(" ");
  return (
    <div class={classes} onclick={`openCardPopup(event, this, ${categoryIndex}, ${cardIndex})`}>
      <div class="img-wrapper">
        {card.img ? (
          <img src={card.img} class="card-img-top" alt={card.name} loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror={`this.onerror=null;this.src=${JSON.stringify(fallbackArtwork)};this.classList.add('loaded')`} />
        ) : specialCardIcons[card.name] ? (
          <img src={specialCardIcons[card.name]} class="card-img-top loaded" alt={card.name} style="object-fit: contain; background: transparent; padding: 10px;" />
        ) : seasonal ? (
          <img src={`/icon/ml/${encodeURIComponent(mlSeasonalIcon(card.name))}.webp`} class="card-img-top loaded" alt={card.name} style="object-fit: cover; border-radius: 10px 10px 0 0;" onerror="this.style.display='none'" />
        ) : (
          <img src={fallbackArtwork} class="card-img-top loaded" alt={`${agency} 企划视觉`} style="object-fit:cover;" />
        )}
      </div>
      <div class="card-body"><h5 class="card-title">{card.name}</h5>{card.subtitle ? <div class="card-subtitle">{card.subtitle}</div> : null}</div>
    </div>
  );
}

function storyClient() {
  const win = window as any;
  const byId = (id: string) => document.getElementById(id) as any;
  let isSortMode = false;
  let isGlobalPopupOpen = false;
  let isAddVersionMode = false;
  let sortableInstances: any[] = [];
  const objectData = (value: unknown): Record<string, any> =>
    value && typeof value === "object" ? value as Record<string, any> : {};

  const getCsrfToken = () => document.cookie.match(/(?:^|; )csrf_token=([^;]+)/)?.[1] ?? null;
  const getFetchOptions = (method = "POST", body: unknown = null, isFormData = false) => {
    const headers: Record<string, string> = {};
    const token = getCsrfToken();
    if (token) headers["X-CSRFToken"] = decodeURIComponent(token);
    const options: RequestInit = { method, credentials: "include", headers };
    if (body) {
      if (isFormData) options.body = body as FormData;
      else {
        headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
      }
    }
    return options;
  };
  const hasEditPermission = () => win.currentUser && ["op", "editor"].includes(win.currentUser.dept);
  const requireEditPermission = () => {
    if (hasEditPermission()) return true;
    alert("您没有操作权限，请先登录并确保拥有编辑权限。");
    return false;
  };
  const updateButtonsVisibility = (user: any) => {
    const visible = user && ["op", "editor"].includes(user.dept);
    ["editToggleBtn", "sortToggleBtn"].forEach((id) => { const element = byId(id); if (element) element.style.display = visible ? "block" : "none"; });
  };
  const checkLogin = async () => {
    try {
      const response = await fetch("/api/check", { credentials: "include" });
      if (!response.ok) return null;
      return objectData(await response.json()).user ?? null;
    } catch (_) {
      return null;
    }
  };
  const closeGlobalPopup = () => {
    const mobile = byId("global-mobile-popup");
    const backdrop = byId("mobile-backdrop");
    const desktop = byId("dynamic-desktop-popup");
    if (mobile) mobile.style.display = "none";
    if (backdrop) backdrop.style.display = "none";
    if (desktop) { desktop.classList.remove("show"); desktop.replaceChildren(); }
    document.querySelectorAll(".story-card.open").forEach((node) => node.classList.remove("open"));
    isGlobalPopupOpen = false;
  };
  const safeLink = (value: string) => {
    try {
      const parsed = new URL(value, location.origin);
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "#";
    } catch (_) {
      return "#";
    }
  };
  const popupContents = (catIdx: number, cardIdx: number) => {
    const category = win.storyData[catIdx];
    const card = category.cards[cardIdx];
    const container = document.createDocumentFragment();
    const header = document.createElement("div");
    header.className = "popup-header";
    header.textContent = card.links?.length ? "📺 选择播放版本" : "⚠️ 暂无视频数据";
    container.append(header);
    (card.links || []).forEach((link: any, linkIdx: number) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:8px;margin-bottom:10px;align-items:stretch";
      const anchor = document.createElement("a");
      anchor.href = safeLink(String(link.url || ""));
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.className = "side-video-btn";
      if (anchor.href.endsWith("#")) anchor.style.cssText = "pointer-events:none;opacity:.5";
      const up = document.createElement("span");
      up.className = "up-name";
      up.textContent = "👤 UP主: " + String(link.up || "");
      const title = document.createElement("span");
      title.className = "video-title";
      title.textContent = String(link.title || "前往播放");
      anchor.appendChild(up);
      anchor.appendChild(title);
      row.appendChild(anchor);
      if (hasEditPermission()) {
        const edit = document.createElement("button");
        edit.className = "btn btn-outline-secondary";
        edit.textContent = "✏️";
        edit.addEventListener("click", () => openEditModalFromIdx(catIdx, cardIdx, linkIdx));
        row.appendChild(edit);
      }
      container.append(row);
    });
    if (card.links?.length && hasEditPermission()) {
      const add = document.createElement("button");
      add.className = "edit-btn m-0 w-100";
      add.textContent = "➕ 追加其他UP主版本";
      add.addEventListener("click", () => openAddVersionModal(category.name, card.name));
      container.append(add);
    }
    return container;
  };
  const openCardPopup = (event: Event, cardElement: HTMLElement, catIdx: number, cardIdx: number) => {
    event.stopPropagation();
    if (isSortMode) return;
    closeGlobalPopup();
    const target = window.innerWidth <= 768 ? byId("global-popup-content") : byId("dynamic-desktop-popup");
    if (!target) return;
    target.replaceChildren(popupContents(catIdx, cardIdx));
    if (window.innerWidth <= 768) {
      byId("mobile-backdrop").style.display = "block";
      byId("global-mobile-popup").style.display = "block";
      isGlobalPopupOpen = true;
    } else {
      cardElement.classList.add("open");
      const rect = cardElement.getBoundingClientRect();
      target.style.top = rect.top + window.scrollY + "px";
      target.style.left = rect.right + 300 > innerWidth ? "auto" : rect.right + 15 + "px";
      target.style.right = rect.right + 300 > innerWidth ? innerWidth - rect.left + 15 + "px" : "auto";
      target.classList.add("show");
    }
  };
  const showAllTabs = (button: HTMLElement) => {
    document.querySelectorAll(".category-section").forEach((section) => section.classList.add("active"));
    document.querySelectorAll("#tabs-bar .tab-btn").forEach((tab) => tab.classList.remove("active"));
    button.classList.add("active");
  };
  const switchTab = (tabId: string, button: HTMLElement) => {
    document.querySelectorAll(".category-section").forEach((section) => section.classList.remove("active"));
    byId(tabId)?.classList.add("active");
    document.querySelectorAll("#tabs-bar .tab-btn").forEach((tab) => tab.classList.remove("active"));
    button.classList.add("active");
    closeGlobalPopup();
  };
  const toggleCategoryTabs = () => {
    byId("tabs-bar")?.classList.toggle("collapsed");
    const collapsed = byId("tabs-bar")?.classList.contains("collapsed");
    if (byId("toggle-icon")) byId("toggle-icon").textContent = collapsed ? "▼ 展开" : "▲ 收起";
  };
  const toggleSCardFilter = () => {
    byId("sCardFilterContent")?.classList.toggle("collapsed");
    if (byId("s-filter-toggle-icon")) {
      byId("s-filter-toggle-icon").textContent = byId("sCardFilterContent")?.classList.contains("collapsed")
        ? "▼ 展开" : "▲ 收起";
    }
  };
  const filterSCards = (name: string, badge: HTMLElement) => {
    document.querySelectorAll("#sCardFilterContent .filter-badge").forEach((node) => node.classList.remove("active"));
    badge.classList.add("active");
    const shortNames: Record<string, string> = {
      "花海咲季": "咲季", "月村手毬": "手毬", "藤田琴音": "琴音", "有村麻央": "麻央",
      "葛城莉莉娅": "莉莉娅", "仓本千奈": "千奈", "紫云清夏": "清夏", "篠泽广": "广",
      "姬崎莉波": "莉波", "花海佑芽": "佑芽", "秦谷美铃": "美铃", "十王星南": "星南", "雨夜燕": "燕",
    };
    const search = shortNames[name] ?? name;
    document.querySelectorAll(".idol-card[data-card-name]").forEach((node: any) => {
      node.style.display = name === "all" || String(node.textContent || "").replace(/\s+/g, "").includes(search)
        ? "" : "none";
    });
  };
  const onCategoryChange = () => {
    const select = byId("form-category-select");
    const input = byId("form-category-new");
    if (select?.tagName !== "SELECT" || !input) return;
    const isNew = select.value === "___NEW___";
    input.style.display = isNew ? "block" : "none";
    input.required = isNew;
    if (byId("btn-delete-category")) {
      byId("btn-delete-category").style.display = !isNew && !byId("form-old-card-name").value && !isAddVersionMode
        ? "inline-block" : "none";
    }
    const imageContainer = byId("form-image-container");
    if (imageContainer) {
      imageContainer.style.display = isAddVersionMode || ["初", "N.I.A", "STEP3"].includes(select.value)
        ? "none" : "block";
    }
  };
  const resetForm = () => {
    ["form-old-card-name", "form-old-category", "form-old-up-hidden", "form-old-url-hidden", "form-card-name", "form-comment", "form-up", "form-title", "form-url"].forEach((id) => { if (byId(id)) byId(id).value = ""; });
    if (byId("form-image")) byId("form-image").value = "";
    if (byId("btn-delete-card")) byId("btn-delete-card").style.display = "none";
  };
  const openAddModal = () => {
    if (!requireEditPermission()) return;
    isAddVersionMode = false;
    resetForm();
    byId("modal-title").textContent = "✨ 录入剧情档案";
    byId("modal-submit-btn").textContent = "💾 确认上传";
  };
  const openEditModalFromIdx = (catIdx: number, cardIdx: number, linkIdx = 0) => {
    const category = win.storyData[catIdx];
    const card = category.cards[cardIdx];
    const link = card.links[linkIdx] || card.links[0] || {};
    openEditModal(category.name, card.name, card.subtitle || "", link.up || "", link.title || "", link.url || "");
  };
  const openEditModal = (category: string, card: string, subtitle: string, up: string, title: string, url: string) => {
    if (!requireEditPermission()) return;
    resetForm();
    byId("modal-title").textContent = "✏️ 修改档案信息";
    byId("modal-submit-btn").textContent = "🔄 确认修改";
    byId("btn-delete-card").style.display = "inline-block";
    byId("form-old-card-name").value = card;
    byId("form-old-category").value = category;
    byId("form-card-name").value = card;
    byId("form-comment").value = subtitle;
    byId("form-up").value = up;
    byId("form-title").value = title;
    byId("form-url").value = url;
    const select = byId("form-category-select");
    if (select) select.value = Array.from(select.options || []).some((option: any) => option.value === category) ? category : "___NEW___";
    if (select?.value === "___NEW___") byId("form-category-new").value = category;
    onCategoryChange();
    win.bootstrap?.Modal.getOrCreateInstance(byId("addStoryModal")).show();
  };
  const openAddVersionModal = (category: string, card: string) => {
    openEditModal(category, card, "", "", "", "");
    isAddVersionMode = true;
    byId("form-old-card-name").value = "";
    byId("modal-title").textContent = "➕ 添加其他UP主版本";
    byId("btn-delete-card").style.display = "none";
  };
  const fetchBiliInfo = async () => {
    if (!requireEditPermission()) return;
    const button = byId("btn-fetch-bili");
    button.disabled = true;
    try {
      const response = await fetch("/api/wiki/parse_bilibili", getFetchOptions("POST", { url: byId("form-url").value }));
      const data = objectData(await response.json());
      if (data.status !== "success") throw new Error(data.msg);
      byId("form-title").value = data.title;
      byId("form-up").value = data.up;
      byId("form-url").value = data.std_url;
    } catch (error: any) {
      alert("解析失败：" + (error?.message || "未知错误"));
    } finally {
      button.disabled = false;
    }
  };
  const saveStoryLayout = async () => {
    const layout = Array.from(document.querySelectorAll(".category-section")).map((section: any) => ({
      category: section.dataset.category,
      cards: Array.from(section.querySelectorAll(".idol-card")).map((card: any) => card.dataset.cardName),
    }));
    await fetch("/api/wiki/save_story_layout", getFetchOptions("POST", { ...win.storyContext, layout }));
  };
  const toggleSortMode = () => {
    if (!requireEditPermission()) return;
    isSortMode = !isSortMode;
    sortableInstances.forEach((instance) => instance.destroy());
    sortableInstances = [];
    if (isSortMode && win.Sortable) {
      document.querySelectorAll(".sortable-grid").forEach((grid) => sortableInstances.push(new win.Sortable(grid, { group: "story-cards", animation: 200, onEnd: saveStoryLayout })));
    }
    byId("sortToggleBtn").textContent = isSortMode ? "💾 正在管理... (拖拽自动保存)" : "🔄 分类排序管理";
  };
  const formFields = () => {
    const select = byId("form-category-select");
    const category = select?.tagName === "SELECT" && select.value === "___NEW___" ? byId("form-category-new").value.trim() : select.value.trim();
    let card = byId("form-card-name").value.trim().replaceAll("|", "｜");
    if (!card.startsWith("【")) card = "【" + card;
    if (!card.endsWith("】")) card += "】";
    const comment = byId("form-comment")?.value.trim().replaceAll("|", "｜") || "";
    const data = new FormData();
    Object.entries({ agency: win.storyContext.agency, idol: win.storyContext.idol, category_name: category, card_name: card, up_name: byId("form-up").value.trim(), video_title: byId("form-title").value.trim(), url: byId("form-url").value.trim().replaceAll("|", "") + (comment ? " | " + comment : "") }).forEach(([key, value]) => data.append(key, String(value)));
    const file = byId("form-image").files?.[0];
    if (file) data.append("image", file);
    return data;
  };
  const submitStory = async () => {
    if (!requireEditPermission()) return;
    const data = formFields();
    const oldCard = byId("form-old-card-name").value;
    let endpoint = "/api/wiki/add_story";
    if (oldCard && !isAddVersionMode) {
      endpoint = "/api/wiki/edit_story";
      data.append("old_card_name", oldCard);
      data.append("old_category_name", byId("form-old-category").value);
    }
    const response = await fetch(endpoint, getFetchOptions("POST", data, true));
    const result = objectData(await response.json());
    if (result.status === "success") location.reload();
    else alert("处理失败：" + result.msg);
  };
  const deleteStory = async () => {
    if (!requireEditPermission() || !confirm("确定要永久删除此剧情吗？")) return;
    const data = new FormData();
    Object.entries({ ...win.storyContext, category_name: byId("form-old-category").value, card_name: byId("form-old-card-name").value }).forEach(([key, value]) => data.append(key === "agency" || key === "idol" ? key : key, String(value)));
    const result = objectData(await (await fetch("/api/wiki/delete_story", getFetchOptions("POST", data, true))).json());
    if (result.status === "success") location.reload(); else alert("删除失败：" + result.msg);
  };
  const deleteCategory = async () => {
    if (!requireEditPermission() || !confirm("确定要删除整个分类吗？")) return;
    const data = new FormData();
    data.append("agency", win.storyContext.agency);
    data.append("idol", win.storyContext.idol);
    data.append("category_name", byId("form-category-select").value);
    const result = objectData(await (await fetch("/api/wiki/delete_category", getFetchOptions("POST", data, true))).json());
    if (result.status === "success") location.reload(); else alert("删除失败：" + result.msg);
  };

  Object.assign(win, { closeGlobalPopup, openCardPopup, showAllTabs, switchTab, toggleCategoryTabs, toggleSCardFilter, filterSCards, onCategoryChange, openAddModal, fetchBiliInfo, toggleSortMode, submitStory, deleteStory, deleteCategory });
  document.addEventListener("click", (event) => { if (isGlobalPopupOpen && !(event.target as Element).closest("#global-mobile-popup")) closeGlobalPopup(); });
  document.addEventListener("DOMContentLoaded", async () => {
    win.currentUser = await checkLogin();
    updateButtonsVisibility(win.currentUser);
    document.querySelectorAll(".idol-select-badge").forEach((badge: any) => badge.addEventListener("click", () => {
      badge.classList.toggle("active-idol");
      const selected = Array.from(document.querySelectorAll(".idol-select-badge.active-idol")).map((node: any) => node.dataset.name);
      byId("form-comment").value = selected.length ? "出场：" + selected.join(", ") : "";
    }));
  });
  setInterval(async () => { win.currentUser = await checkLogin(); updateButtonsVisibility(win.currentUser); }, 34600);
}

const storyStyles = `
.story-card.dash-empty{background-color:#f8f9fa!important;border:2px dashed #ced4da!important;box-shadow:none!important;opacity:.6;transition:all .3s ease}
.story-card.dash-empty:hover{opacity:1;border-style:solid!important;border-color:var(--theme-color)!important;background-color:#fff!important}
.story-card.dash-empty .card-title,.story-card.dash-empty .card-subtitle{color:#999!important}
.story-card.dash-empty .img-wrapper{filter:grayscale(100%);opacity:.5}
.btn-765pro{background:#fff;color:var(--idol-theme-color,#f34f6d);border:2px solid var(--idol-theme-color,#f34f6d);padding:12px 15px;font-size:15px;font-weight:bold;border-radius:8px;cursor:pointer;transition:all .2s ease-in-out;box-shadow:0 2px 5px rgba(0,0,0,.05);margin-bottom:10px;width:100%;text-align:center;word-wrap:break-word;white-space:normal}
.btn-765pro:hover{background:var(--idol-theme-color,#f34f6d);color:#fff;transform:translateY(-2px);box-shadow:0 4px 10px rgba(0,0,0,.15)}
`;

export function WikiStoryTemplate(props: WikiStoryTemplateProps) {
  const fallback = agencyTheme[props.agency] ?? "#ff9a9e";
  const pageColor = safeColor(props.idolColor, fallback);
  const isGakumasSCard = props.agency === "学园偶像大师" && ["S卡", "s卡", "s_card"].includes(props.idol.trim());
  const bodyClass = ["show-all-mode", props.agency === "百万现场" ? "ml-layout" : "", props.agency === "灰姑娘女孩" ? "cg-layout" : "", props.agency === "学园偶像大师" ? "gk-layout" : ""].filter(Boolean).join(" ");
  const contextJson = scriptJson({ agency: props.agency, idol: props.idol });
  const dataJson = scriptJson(props.categories);
  return (
    <>
      {raw("<!DOCTYPE html>")}
      <html lang="zh-CN">
        <head>
          <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>{props.idol} - 剧情档案</title>
          <link rel="icon" type="image/png" href="/assets/images/titleicon/informationedit.png" />
          <link href="https://cdn.bootcdn.net/ajax/libs/twitter-bootstrap/5.3.0/css/bootstrap.min.css" rel="stylesheet" />
          <script src="https://cdn.bootcdn.net/ajax/libs/twitter-bootstrap/5.3.0/js/bootstrap.bundle.min.js"></script>
          <script src="https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js"></script>
          <link rel="stylesheet" href="/css/story.css" />
          <style dangerouslySetInnerHTML={{ __html: `:root{--theme-color:${pageColor};--theme-light:${pageColor}33;--page-bg:${pageColor}12}${storyStyles}` }} />
        </head>
        <body class={bodyClass}>
          <div id="dynamic-desktop-popup" onclick="event.stopPropagation()"></div>
          <div id="mobile-backdrop" onclick="closeGlobalPopup()"></div>
          <div id="global-mobile-popup" onclick="event.stopPropagation()"><div id="global-popup-content"></div></div>
          <div class="container-fluid pt-4 pb-5 px-xl-5 px-lg-4 px-md-3" style="max-width:1600px;margin:0 auto">
            <div class="row">
              <div class="col-xl-2 col-lg-3 col-md-4 mb-4">
                <div class="profile-container position-sticky" style="top:20px">
                  <h3 class="text-center fw-bold mb-3" style="color:var(--theme-color)">{props.idol}</h3>
                  {props.avatarUrl ? <img class="img-fluid mx-auto d-block profile-img card-img-top" src={props.avatarUrl} loading="lazy" decoding="async" style={props.avatarFit === "contain" ? "object-fit:contain;padding:16%;background:#fff;" : undefined} onload="this.classList.add('loaded')" onerror="this.style.display='none'" alt={props.idol} /> :
                    <div class="mx-auto d-flex align-items-center justify-content-center profile-img" style="background:var(--theme-light);color:var(--theme-color);font-weight:900;font-size:28px;text-align:center;border-radius:8px;margin-bottom:20px;aspect-ratio:1;border:4px solid var(--theme-light)">{props.idol}</div>}
                  <div class="d-grid gap-2">
                    <button class="btn btn-custom btn-add" data-bs-toggle="modal" data-bs-target="#addStoryModal" onclick="openAddModal()" id="editToggleBtn" style="display:none">➕ 录入档案</button>
                    <button class="btn btn-custom toggle-btn" id="sortToggleBtn" onclick="toggleSortMode()" style="display:none">🔄 分类排序管理</button>
                    <a href="https://idol-master.top/" class="btn w-100 btn-custom btn-back">⬅ 返回导航页</a>
                    <a href={`https://idol-master.top/wiki/?agency=${encodeURIComponent(props.agency)}`} class="btn w-100 btn-custom btn-back">⬅ 返回上一页</a>
                  </div>
                </div>
              </div>
              <div class="col-xl-10 col-lg-9 col-md-8">
                {isGakumasSCard ? <div class="sticky-tabs-wrapper"><button class="tabs-toggle-btn" onclick="toggleSCardFilter()">🔍 出场偶像快速筛选 <span id="s-filter-toggle-icon">▲ 收起</span></button><div class="category-tabs" id="sCardFilterContent"><div class="filter-badge active" onclick="filterSCards('all',this)">🌟 全部显示</div>{sCardFilterNames.map((name) => <div class="filter-badge" data-filter-name={name} onclick="filterSCards(this.dataset.filterName,this)">{name}</div>)}</div></div> : null}
                {props.categories.length ? (
                  <>
                    {!isGakumasSCard ? <div class="sticky-tabs-wrapper"><button class="tabs-toggle-btn" onclick="toggleCategoryTabs()">🏷️ 分类筛选 <span id="toggle-icon">▼ 展开</span></button><div class="category-tabs collapsed" id="tabs-bar"><button class="tab-btn active" onclick="showAllTabs(this)">全部展开</button>{props.categories.map((category, index) => <button class="tab-btn" onclick={`switchTab('tab-${index + 1}',this)`}>{category.name} <span class="badge">{category.cards.length}</span></button>)}</div></div> : null}
                    <div class="tab-content-container">
                      {props.categories.map((category, categoryIndex) => <div id={`tab-${categoryIndex + 1}`} class="tab-pane category-section active" data-category={category.name}>{!isGakumasSCard ? <h4 class="category-header">📂 ({category.name})</h4> : null}<div class="sortable-grid" style={`--idol-theme-color:${pageColor}`}>{category.cards.map((card, cardIndex) => <div class="idol-card" data-card-name={card.name}><StoryCardView agency={props.agency} idol={props.idol} category={category} card={card} categoryIndex={categoryIndex} cardIndex={cardIndex} /></div>)}</div><div class="empty-category-hint">📭 此分类下暂无剧情 (开启拖拽可将卡片移动至此)</div></div>)}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div class="modal fade" id="addStoryModal" tabindex={-1} aria-hidden="true">
            <div class="modal-dialog"><div class="modal-content" style="border-radius:20px;border:none;overflow:hidden">
              <div class="modal-header border-0" style="background:var(--theme-color)"><h5 class="modal-title fw-bold text-white" id="modal-title">✨ 录入剧情档案</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button></div>
              <div class="modal-body p-4"><form id="storyForm">
                <input type="hidden" id="form-old-card-name" value="" /><input type="hidden" id="form-old-category" value="" /><input type="hidden" id="form-old-up-hidden" value="" /><input type="hidden" id="form-old-url-hidden" value="" />
                {!isGakumasSCard ? <div class="mb-4"><label class="form-label fw-bold text-secondary">📁 所属分类</label><select class="form-select border-2" id="form-category-select" style="border-color:var(--theme-light)" onchange="onCategoryChange()">{props.categories.map((category) => <option value={category.name}>{category.name}</option>)}<option value="___NEW___" class="text-primary fw-bold">➕ 添加新分类...</option></select><input type="text" class="form-control border-2 mt-2" id="form-category-new" style="border-color:var(--theme-light);display:none" placeholder="请输入新分类名称..." oninput="onCategoryChange()" /></div> : <><input type="hidden" id="form-category-select" value="S卡" /><input type="hidden" id="form-category-new" value="" /></>}
                <div class="mb-3"><label class="form-label fw-bold text-secondary">🏷️ 卡名 / 剧情名</label><input type="text" class="form-control" id="form-card-name" required placeholder="如：花夢語り (保存时自动加【】)" /></div>
                {isGakumasSCard ? <div class="mb-3" id="form-comment-container"><label class="form-label fw-bold text-secondary">👥 出场角色 (点击标签多选，自动生成)</label><input type="hidden" id="form-comment" value="" /><div id="idol-selector-container" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:5px">{sCardFormNames.map((name) => <span class="badge rounded-pill idol-select-badge" data-name={name}>{name}</span>)}</div></div> : <div class="mb-3" id="form-comment-container"><label class="form-label fw-bold text-secondary">📝 附加注释 (选填)</label><input type="text" class="form-control" id="form-comment" placeholder="如：SSR / 10月活动 (将显示在卡名下方)" /></div>}
                <hr class="text-black-50 my-4" /><div class="mb-3"><label class="form-label fw-bold" style="color:#00a1d6">🔗 B站链接 或 BV号 (优先填写自动获取)</label><div class="input-group"><input type="text" class="form-control border-2" id="form-url" placeholder="如: https://... 或 BV1xx411c7mD" style="border-color:#00a1d6" /><button class="btn fw-bold text-white" type="button" id="btn-fetch-bili" style="background-color:#00a1d6;border-color:#00a1d6" onclick="fetchBiliInfo()">⚡ 自动获取</button></div></div>
                <div class="mb-3 row"><div class="col-5"><label class="form-label fw-bold text-secondary">👤 UP主</label><input type="text" class="form-control" id="form-up" placeholder="可自动获取" required /></div><div class="col-7"><label class="form-label fw-bold text-secondary">🎬 视频分P名 / 视频名</label><input type="text" class="form-control" id="form-title" placeholder="可自动获取" required /></div></div>
                <div class="mb-3 mt-4" id="form-image-container"><label class="form-label fw-bold text-secondary">🖼️ 替换卡面图片 (不传则不修改)</label><input class="form-control" type="file" id="form-image" accept="image/png, image/jpeg, image/webp" /></div>
              </form></div>
              <div class="modal-footer border-0 d-flex justify-content-between pb-4 w-100" style="background-color:#f8f9fa"><div><button type="button" class="btn btn-outline-danger rounded-pill px-3" id="btn-delete-card" onclick="deleteStory()" style="display:none;font-weight:bold">🗑️ 删除此剧情</button><button type="button" class="btn btn-outline-danger rounded-pill px-3" id="btn-delete-category" onclick="deleteCategory()" style="display:none;font-weight:bold">🗑️ 删除整栏</button></div><div class="d-flex gap-2"><button type="button" class="btn btn-secondary rounded-pill px-4" data-bs-dismiss="modal">取消</button><button type="button" class="btn rounded-pill px-4 text-white fw-bold" id="modal-submit-btn" style="background:var(--theme-color)" onclick="submitStory()">💾 确认</button></div></div>
            </div></div>
          </div>
          <script dangerouslySetInnerHTML={{ __html: `window.storyData = ${dataJson};\nwindow.storyContext = ${contextJson};\n((__name) => (${storyClient.toString()})())((target, value) => target);` }} />
        </body>
      </html>
    </>
  );
}
