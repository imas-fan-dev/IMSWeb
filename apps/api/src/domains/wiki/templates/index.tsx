import { raw } from "hono/html";
import type { WikiIdol, WikiRandomBackground } from "@/domains/wiki/models";
import { Agency765Template } from "@/domains/wiki/templates/agencies/765";
import { Agency876Template } from "@/domains/wiki/templates/agencies/876";
import { AgencyCgTemplate } from "@/domains/wiki/templates/agencies/cg";
import { AgencyGkTemplate } from "@/domains/wiki/templates/agencies/gk";
import { AgencyMlTemplate } from "@/domains/wiki/templates/agencies/ml";
import { AgencyScTemplate } from "@/domains/wiki/templates/agencies/sc";
import { AgencySidemTemplate } from "@/domains/wiki/templates/agencies/sidem";
import { GenericAgencyGrid, scriptJson } from "@/domains/wiki/templates/shared";

export interface WikiHomeAgency {
  name: string;
  color: string;
  idols: WikiIdol[];
}

export interface WikiHomeTemplateProps {
  agencies: WikiHomeAgency[];
  initialBg: WikiRandomBackground | null;
}

const agencyIcons: Record<string, string> = {
  "765PRO": "765pro", "876PRO": "876pro", "灰姑娘女孩": "cg", "百万现场": "ml",
  SideM: "sidem", "闪耀色彩": "sc", "学园偶像大师": "gk",
};

function AgencyContents(props: WikiHomeAgency) {
  const common = { agency: props.name, agencyColor: props.color, idols: props.idols };
  switch (props.name) {
    case "765PRO": return <Agency765Template {...common} />;
    case "876PRO": return <Agency876Template {...common} />;
    case "灰姑娘女孩": return <AgencyCgTemplate {...common} />;
    case "百万现场": return <AgencyMlTemplate {...common} />;
    case "SideM": return <AgencySidemTemplate {...common} />;
    case "闪耀色彩": return <AgencyScTemplate {...common} />;
    case "学园偶像大师": return <AgencyGkTemplate {...common} />;
    default: return <GenericAgencyGrid {...common} />;
  }
}

const homeScript = `
let currentActiveAgency = '';
let activeBgLayer = 1;
const colorMapForBg = {};

function updateBgSource(data) {
  const btn = document.getElementById('bgSourceBtn');
  const text = document.getElementById('bgSourceText');
  if (!data || !data.url || !btn || !text) return;
  text.textContent = (data.idol_name || '') + ' - ' + (data.card_name || '');
  btn.href = '/story?agency=' + encodeURIComponent(data.agency_name || '') + '&idol=' + encodeURIComponent(data.idol_name || '');
  btn.style.setProperty('--tab-color', colorMapForBg[data.agency_name] || '#ffdde1');
  btn.style.display = 'flex';
}

function setBackgroundImage(url) {
  const one = document.getElementById('bgLayer1');
  const two = document.getElementById('bgLayer2');
  if (!one || !two) return;
  const incoming = activeBgLayer === 1 ? two : one;
  const outgoing = activeBgLayer === 1 ? one : two;
  incoming.style.backgroundImage = 'url(' + JSON.stringify(url) + ')';
  incoming.style.opacity = '1';
  outgoing.style.opacity = '0';
  activeBgLayer = activeBgLayer === 1 ? 2 : 1;
}

async function fetchRandomBg() {
  if (window.innerWidth <= 850) return;
  const btn = document.getElementById('bgSwitchBtn');
  if (btn) btn.innerHTML = '<span>⏳</span> 切换中...';
  try {
    const response = await fetch('/api/wiki/random_bg?t=' + Date.now(), { cache: 'no-store' });
    const data = await response.json();
    if (!data || !data.url) throw new Error('empty');
    const image = new Image();
    image.onload = () => {
      setBackgroundImage(data.url);
      updateBgSource(data);
      if (btn) btn.innerHTML = '<span>🖼️</span> 切换壁纸';
    };
    image.onerror = () => { if (btn) btn.textContent = '❌ 图片损坏'; };
    image.src = data.url;
  } catch (_) {
    if (btn) btn.textContent = '⚠️ 暂无图库';
    setTimeout(() => { if (btn) btn.innerHTML = '<span>🖼️</span> 切换壁纸'; }, 2000);
  }
}

function openAgency(agencyName) {
  currentActiveAgency = agencyName;
  const url = new URL(window.location.href);
  url.searchParams.set('agency', agencyName);
  history.replaceState(null, '', url);
  document.querySelectorAll('.tab-btn[data-agency]').forEach((button) => button.classList.toggle('active', button.dataset.agency === agencyName));
  document.querySelectorAll('.agency-section').forEach((section) => section.classList.toggle('active', section.dataset.agency === agencyName));
  const active = document.querySelector('.tab-btn[data-agency].active');
  document.documentElement.style.setProperty('--current-theme', active ? active.dataset.color : '#ffdde1');
  document.querySelectorAll('.idol-card').forEach((card) => card.classList.remove('hidden'));
}

function filterIdols() {
  const input = document.getElementById('searchInput');
  const query = input ? input.value.toLocaleLowerCase().trim() : '';
  document.querySelectorAll('.agency-section').forEach((section) => {
    let visible = false;
    section.querySelectorAll('.idol-card').forEach((card) => {
      const match = (card.dataset.name || card.textContent || '').toLocaleLowerCase().includes(query);
      card.classList.toggle('hidden', !match);
      visible = visible || match;
    });
    if (query) section.classList.toggle('active', visible);
  });
  if (!query && currentActiveAgency) openAgency(currentActiveAgency);
}

function closeSearch() {
  const overlay = document.getElementById('searchOverlay');
  const input = document.getElementById('searchInput');
  if (overlay) overlay.classList.remove('active');
  if (input) input.value = '';
  filterIdols();
}

function enableFabDrag(fab, overlay) {
  let active = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;
  fab.style.touchAction = 'none';
  fab.addEventListener('pointerdown', (event) => {
    const rect = fab.getBoundingClientRect();
    active = true;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    initialLeft = rect.left;
    initialTop = rect.top;
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
    fab.style.left = initialLeft + 'px';
    fab.style.top = initialTop + 'px';
    fab.setPointerCapture(event.pointerId);
  });
  fab.addEventListener('pointermove', (event) => {
    if (!active) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    moved = moved || Math.abs(dx) > 5 || Math.abs(dy) > 5;
    if (!moved) return;
    event.preventDefault();
    fab.style.left = Math.max(0, Math.min(initialLeft + dx, innerWidth - fab.offsetWidth)) + 'px';
    fab.style.top = Math.max(0, Math.min(initialTop + dy, innerHeight - fab.offsetHeight)) + 'px';
  });
  const finish = (event) => {
    if (!active) return;
    active = false;
    try { fab.releasePointerCapture(event.pointerId); } catch (_) {}
    if (!moved) overlay.classList.toggle('active');
  };
  fab.addEventListener('pointerup', finish);
  fab.addEventListener('pointercancel', finish);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab-btn[data-agency]').forEach((button) => {
    colorMapForBg[button.dataset.agency] = button.dataset.color;
    button.addEventListener('click', () => openAgency(button.dataset.agency));
  });
  const requested = new URLSearchParams(location.search).get('agency');
  const first = document.querySelector('.tab-btn[data-agency]');
  openAgency(requested || (first && first.dataset.agency) || '');
  const initial = window.__wikiInitialBg;
  if (initial && initial.url) {
    const firstLayer = document.getElementById('bgLayer1');
    if (firstLayer) firstLayer.style.backgroundImage = 'url(' + JSON.stringify(initial.url) + ')';
    updateBgSource(initial);
  } else {
    fetchRandomBg();
  }
  const fab = document.getElementById('fabSearch');
  const overlay = document.getElementById('searchOverlay');
  if (fab && overlay) enableFabDrag(fab, overlay);
  setInterval(fetchRandomBg, 60000);
});
`;

export function WikiHomeTemplate(props: WikiHomeTemplateProps) {
  const initialJson = scriptJson(props.initialBg);
  return (
    <>
      {raw("<!DOCTYPE html>")}
      <html lang="zh-CN">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <link rel="icon" type="image/png" href="/assets/images/titleicon/informationedit.png" />
          <meta name="color-scheme" content="light" />
          <title>✨ 剧情导航站 ✨</title>
          <link rel="stylesheet" href="/css/main.css?v=38.0" />
          {props.initialBg?.url ? <link rel="preload" as="image" href={props.initialBg.url} /> : null}
        </head>
        <body>
          <div id="bgLayer1" class="dynamic-bg" style="opacity: 1;"></div>
          <div id="bgLayer2" class="dynamic-bg" style="opacity: 0;"></div>
          <div class="app-window">
            <div class="main-layout">
              <div class="sidebar" id="sidebarContainer">
                {props.agencies.map((agency) => (
                  <button class="tab-btn" data-agency={agency.name} data-color={agency.color} id={`tab-${agency.name}`} style={`--tab-color: ${agency.color};`}>
                    <div class="tab-left">
                      <img src={`/icon/${agencyIcons[agency.name] ?? "special"}.webp`} alt={agency.name} class="tab-icon" onerror="this.style.display='none'" />
                      <span class="tab-text">{agency.name}</span>
                    </div>
                  </button>
                ))}
                <button class="tab-btn home-btn" onclick="location.href='/'">
                  <div class="tab-left"><span class="icon">🏠</span><span class="tab-text">返回首页</span></div>
                </button>
              </div>
              <div class="content-area" id="contentContainer">
                {props.agencies.map((agency) => (
                  <div class="agency-section" id={`page-${agency.name}`} data-agency={agency.name} style={`--current-agency-color: ${agency.color};`}>
                    <AgencyContents {...agency} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <a href="#" class="bg-source-btn" id="bgSourceBtn" target="_blank" style="display: none;">
            <span class="icon">🔍</span><span class="text" id="bgSourceText">未知来源</span>
          </a>
          <button class="change-bg-btn" id="bgSwitchBtn" onclick="fetchRandomBg()"><span>🖼️</span> 切换壁纸</button>
          <div class="fab-search" id="fabSearch" role="button" tabindex={0}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
          <div class="search-overlay" id="searchOverlay">
            <span style="font-size: 20px;">🔍</span>
            <input type="text" id="searchInput" placeholder="搜索偶像名字..." oninput="filterIdols()" />
            <button class="close-search-btn" onclick="closeSearch()">✖</button>
          </div>
          <script dangerouslySetInnerHTML={{ __html: `window.__wikiInitialBg = ${initialJson};\n${homeScript}` }} />
        </body>
      </html>
    </>
  );
}
