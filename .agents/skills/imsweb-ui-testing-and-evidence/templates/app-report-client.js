document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const rootData = window.REPORT_DATA;
  const combined = rootData.mode === 'combined-acceptance';
  let scope = combined ? 'app' : rootData.mode === 'web-acceptance' ? 'web' : 'app';
  let data = combined ? rootData.scopes[scope] : rootData;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${data.icons[name] || data.icons.circle}</svg>`;
  const badge = (label, tone = '') => `<span class="badge ${tone}"><i class="status-dot"></i>${esc(label)}</span>`;
  // Parse into an inert document, remove active markup, then insert allowed nodes.
  // Both metadata text and attribute values are escaped before this boundary.
  function renderHtml(target, markup, append = false) {
    const tags = new Set(['div', 'span', 'button', 'article', 'img', 'p', 'h2', 'h3', 'small', 'b', 'code', 'i', 'ul', 'li', 'a', 'dl', 'dt', 'dd', 'br', 'svg', 'path', 'circle', 'line', 'rect', 'polygon', 'polyline', 'ellipse', 'g']);
    const attributes = new Set(['class', 'id', 'role', 'title', 'tabindex', 'disabled', 'hidden', 'href', 'src', 'alt', 'download', 'width', 'height', 'viewbox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'transform']);
    try {
      const parsed = new DOMParser().parseFromString(markup, 'text/html');
      for (const element of parsed.body.querySelectorAll('*')) {
        if (!tags.has(element.localName)) { element.remove(); continue; }
        for (const attribute of [...element.attributes]) {
          const name = attribute.name.toLowerCase();
          if (!attributes.has(name) && !/^(aria|data)-[a-z0-9-]+$/.test(name)) { element.removeAttribute(attribute.name); continue; }
          if (name === 'href' || name === 'src') {
            const value = attribute.value;
            if (/^data:image\/png;base64,[a-z0-9+/=\r\n]+$/i.test(value)) continue;
            const url = new URL(value, document.baseURI), base = new URL(document.baseURI);
            if (!['http:', 'https:', 'file:'].includes(url.protocol) || url.origin !== base.origin) element.removeAttribute(attribute.name);
          }
        }
      }
      const fragment = document.createDocumentFragment(); fragment.append(...parsed.body.childNodes);
      if (append) target.append(fragment); else target.replaceChildren(fragment);
    } catch (error) { target.textContent = '内容无法显示'; throw error; }
  }
  const groupFor = page => data.groups.find(group => group.id === page.group);
  let web = data.mode === 'web-acceptance';
  document.body.dataset.reportMode = data.mode;
  const targetName = () => data.targets.find(t => t.id === platform).label;
  let platform = data.targets[0].id, group = 'all', status = 'all', search = '';
  let currentPage = null, currentImage = 0, currentTab = 'checks', visiblePages = [];
  let toastTimer;

  function replaceIcons() {
    $$('[data-icon]').forEach(element => { renderHtml(element, icon(element.dataset.icon)); });
  }
  function changeScope(next) {
    if (!combined || next === scope) return;
    $$('dialog[open]').forEach(dialog => dialog.close());
    scope = next; data = rootData.scopes[scope]; web = scope === 'web';
    document.body.dataset.reportMode = data.mode;
    platform = data.targets[0].id;
    currentPage = null; currentImage = 0; currentTab = 'checks';
    $('#image-stage').replaceChildren(); $('#thumbnails').replaceChildren();
    $('#zoom-image').removeAttribute('src');
    clearTimeout(toastTimer); $('#toast').hidden = true;
    renderHtml($('.platform-switch'), data.targets.map((target, index) => `<button data-platform="${target.id}" aria-pressed="${index === 0}">${icon(target.id === 'desktop' ? 'monitor' : 'smartphone')}<span>${esc(target.label)}</span></button>`).join(''));
    reset();
  }
  function scopeLabels() {
    if (!combined) return;
    $$('[data-scope]').forEach(button => {
      const active = button.dataset.scope === scope;
      button.setAttribute('aria-selected', active); button.tabIndex = active ? 0 : -1;
    });
    $('#report-workspace').setAttribute('aria-labelledby', `scope-${scope}`);
    $('.workspace small').textContent = web ? '页面与场景 · 桌面 / 手机' : '页面与场景 · iOS / Android';
    $('.sidebar-note p').textContent = web ? '同一页面，分别保留桌面和手机浏览器的结果与截图。' : '同一页面，分别保留 iOS 和 Android 的结果与截图。';
    $('.page-heading p').textContent = web ? '按桌面与手机浏览截图，点击查看验收详情。' : '按 iOS 与 Android 浏览截图，点击查看验收详情。';
    $('[data-status="native"]').firstChild.textContent = web ? '有 Web 截图' : '有原生证据';
    $('[data-status="pending"]').firstChild.textContent = web ? '待 Web 验收' : '待原生验收';
    $('#missing-section .section-divider p').textContent = web ? '页面清单已建立，等待对应浏览器环境的截图。' : '页面清单已建立，等待对应平台的原生截图。';
    $('.page-footer>span:first-child').lastChild.textContent = web ? '桌面与手机独立记录 · 截图不等于全页通过' : 'iOS 与 Android 独立记录 · 截图不等于全页通过';
    $('#about-dialog>p').textContent = web ? '按页面浏览 Web 验收结果，桌面与手机保持独立。' : '按页面浏览 App 验收结果，iOS 与 Android 保持独立。';
    $('.about-flow>div:first-child p').textContent = web ? '从 Web 路由建立目录，未执行页面保留清单。' : '从 App 路由生成五栏目目录，合并别名、展开个人子页。';
    $('.about-flow>div:nth-child(2) p').textContent = web ? '各自保留浏览器、视口、数据模式与源码核对记录。' : '各自保留设备、系统、数据模式与源码 / 包绑定。';
    renderHtml($('#about-dialog ul'), `<li><b>PASS</b>：${web ? '必需场景具备当前源码的浏览器结果、执行回执及已审阅首屏/整页截图。' : '全部必需场景具备当前源码的原生结果、绑定回执及已审核运行截图。'}</li><li><b>PARTIAL / UNRUN</b>：场景或证据待补。历史与辅助截图不贡献当前通过。</li><li><b>REWORK / BLOCKED</b>：场景失败、截图需返工，或执行受阻；失败与重试保留。</li>`);
  }
  function imagesFor(page) {
    const current = new Set(data.coverage[platform].pages.find(item => item.id === page.id).scenarios.flatMap(scene => scene.screenshotIds));
    return [...data.reports[platform].screenshots.filter(image => image.page === page.id), ...data.references.filter(image => image.page === page.id)]
      .sort((a, b) => Number(current.has(b.id)) - Number(current.has(a.id)) || Number(a.kind !== 'runtime') - Number(b.kind !== 'runtime'));
  }
  function stateFor(page) {
    return data.coverage[platform].pages.find(item => item.id === page.id).verdict;
  }
  function stateBadge(page) {
    const state = stateFor(page);
    if (state === 'PASS') return badge('验收通过', 'pass');
    if (state === 'REWORK') return badge('需要返工', 'warning');
    if (state === 'BLOCKED') return badge('验收阻塞', 'warning');
    if (state === 'PARTIAL') return badge('部分场景有证据', 'warning');
    return badge(hasNative(page) ? '待补当前验收' : imagesFor(page).length ? (web ? '待 Web 验收' : '待原生验收') : '待验收');
  }
  function hasNative(page) { return imagesFor(page).some(image => image.provenance === (web ? 'web' : 'native') && image.kind === 'runtime'); }
  function matchesStatus(page, target) {
    if (target === 'native') return hasNative(page);
    if (target === 'pending') return stateFor(page) === 'UNRUN';
    if (target === 'attention') return ['REWORK', 'BLOCKED', 'PARTIAL'].includes(stateFor(page));
    return true;
  }
  function matchesSearch(page) { return `${page.title} ${page.route} ${(page.aliases || []).join(' ')} ${groupFor(page).name}`.toLowerCase().includes(search.toLowerCase().trim()); }
  function render() {
    scopeLabels();
    document.body.dataset.acceptanceScope = scope;
    document.body.dataset.target = platform;
    const report = data.reports[platform];
    const scoped = data.pages.filter(page => (group === 'all' || group === page.group) && matchesSearch(page));
    visiblePages = scoped.filter(page => matchesStatus(page, status));
    // The screenshot gallery comes first; missing pages remain a separate compact list.
    visiblePages.sort((a, b) => Number(hasNative(b)) - Number(hasNative(a)) || Number(imagesFor(b).length > 0) - Number(imagesFor(a).length > 0));
    renderHtml($('#navigation'), [{ id: 'all', name: '全部页面', icon: 'layout-grid' }, ...data.groups].map(item => `<button class="nav-item ${group === item.id ? 'active' : ''}" data-group="${esc(item.id)}" aria-pressed="${group === item.id}">${icon(item.icon)}<span>${esc(item.name)}</span><span class="nav-count">${data.pages.filter(page => item.id === 'all' || page.group === item.id).length}</span></button>`).join(''));
    const nativeCount = data.pages.filter(hasNative).length;
    const domCount = data.pages.filter(page => !hasNative(page) && imagesFor(page).length).length;
    const missingCount = data.pages.length - nativeCount - domCount;
    renderHtml($('#stats'), [
      ['验收页面', data.pages.length, '个页面', 'layout-grid'], [web ? '有 Web 截图' : '有原生证据', nativeCount, '个页面', web ? 'monitor' : 'smartphone'],
      ['仅辅助截图', domCount, '个页面', 'monitor'], ['待收录截图', missingCount, '个页面', 'image'],
    ].map(([label, number, unit, glyph]) => `<div class="stat"><div class="stat-label">${icon(glyph)}${esc(label)}</div><div class="stat-number">${number}<span>${esc(unit)}</span></div></div>`).join(''));
    $('#device-label').textContent = report.runs.length ? [...new Set(report.runs.map(run => `${run.device} · ${web ? run.browser : run.os}`))].join(' / ') : web ? '尚未录入浏览器运行环境' : '尚未录入原生运行环境';
    $$('[data-platform]').forEach(button => button.setAttribute('aria-pressed', button.dataset.platform === platform));
    $$('[data-status]').forEach(button => {
      button.setAttribute('aria-pressed', button.dataset.status === status);
      button.querySelector('span').textContent = scoped.filter(page => matchesStatus(page, button.dataset.status)).length;
    });
    renderHtml($('#gallery-title'), `${esc(group === 'all' ? '全部页面' : data.groups.find(item => item.id === group).name)} <span id="page-count">${visiblePages.length}</span>`);
    $('#gallery-subtitle').textContent = search ? `“${search}”的匹配结果，各运行环境状态独立保留。` : `当前环境页面覆盖：${data.coverage[platform].verdict}。先看画面，再检查场景与证据。`;
    const captured = visiblePages.filter(page => imagesFor(page).length);
    const missing = visiblePages.filter(page => !imagesFor(page).length);
    renderHtml($('#cards'), captured.map(page => {
      const image = imagesFor(page)[0], native = image.provenance === (web ? 'web' : 'native'), category = groupFor(page);
      return `<article class="page-card"><button class="card-open" data-page="${esc(page.id)}" aria-label="查看${esc(page.title)}的验收详情"><div class="card-image"><img src="${esc(image.asset)}" alt="${esc(image.title)}，${esc(image.renderer)}" loading="lazy"><span class="image-type ${native ? 'native' : ''}">${icon(native && !web ? 'smartphone' : 'monitor')}${image.kind === 'diagnostic' ? '诊断图' : image.kind === 'reference' ? '参考图' : native ? (web ? targetName() : platform === 'ios' ? 'iOS 原生' : 'Android 原生') : image.renderer === 'web' ? 'Web 参考' : 'DOM 参考'}</span><span class="image-counter">${icon('image')}${imagesFor(page).length} 张</span><span class="open-overlay"><span>${icon('maximize-2')}查看验收详情</span></span></div><div class="card-body"><div class="card-group">${esc(category.name)} ${icon('chevron-right')} ${page.private ? '需登录' : '公共页面'}</div><div class="card-title-row"><h3>${esc(page.title)}</h3><span>${icon('arrow-up-right')}</span></div><code class="route-label">${esc(page.route)}</code><div class="card-footer">${stateBadge(page)}<span class="scene-count">${page.scenarios.filter(scene => scene.required !== false).length} 个必需场景</span></div></div></button></article>`;
    }).join(''));
    renderHtml($('#missing-cards'), missing.map(page => `<button class="missing-card" data-page="${esc(page.id)}" aria-label="查看${esc(page.title)}的待验收清单"><span class="missing-icon">${icon(groupFor(page).icon)}</span><div><h3>${esc(page.title)}</h3><code class="route-label">${esc(page.route)}</code></div>${badge('待验收')}</button>`).join(''));
    $('#missing-section').hidden = !missing.length;
    $('#missing-count').textContent = `${missing.length} 个页面`;
    $('#empty').hidden = visiblePages.length > 0;
    $('#cards').hidden = !captured.length;
    $('#inventory-source').textContent = `页面目录 ${data.inventoryCommit.slice(0, 8)} · ${data.pages.length} 个页面`;
    $('#normalization').textContent = `${data.routeCount ?? '未知数量的'} 条 ${web ? 'Web' : 'App'} 路由整理为 ${data.pages.length} 个验收页面。${data.normalization || ''} 另有 ${data.unassociated} 张未关联页面的图片，见全部证据图册。`;
  }
  function checklist(page, _image) {
    const details = data.coverage[platform].pages.find(item => item.id === page.id);
    return `<ul class="checklist">${details.scenarios.map(scene => {
      const pass = scene.verdict === 'PASS';
      return `<li class="${pass ? 'done' : ''}" title="${esc(scene.reason)}"><span>${icon(pass ? 'circle-check' : 'circle')}${esc(scene.title)}${scene.required === false ? '（补测）' : ''}</span>${badge(scene.verdict, pass ? 'pass' : scene.verdict === 'UNRUN' ? '' : 'warning')}</li>`;
    }).join('')}</ul>`;
  }
  function showDetail(pageId, imageIndex = 0, keepTab = false) {
    const page = data.pages.find(item => item.id === pageId);
    if (!page) return;
    currentPage = page;
    currentImage = imageIndex;
    if (!keepTab) currentTab = 'checks';
    const images = imagesFor(page), image = images[imageIndex];
    const run = data.runs.find(item => item.id === image?.runId), native = image?.provenance === (web ? 'web' : 'native');
    $('#detail-platform').textContent = `${targetName()} / 页面验收`;
    $('#detail-group').textContent = `${groupFor(page).name} / ${page.private ? '登录后页面' : '公共页面'}`;
    $('#detail-title').textContent = page.title;
    $('#detail-route').textContent = page.route;
    renderHtml($('#detail-badges'), stateBadge(page) + badge(native ? `${run?.device || '未知设备'} · ${image.kind}` : image ? `${image.renderer} · 仅作参考` : '无截图', native ? 'accent' : ''));
    $('#image-label').textContent = image ? `${image.renderer} · ${image.kind} · 审图 ${image.review}` : web ? '等待浏览器截图' : '等待原生截图';
    renderHtml($('#image-stage'), image ? `<img src="${esc(image.asset)}" alt="${esc(image.title)}">` : `<div class="no-evidence"><span>${icon('image')}</span><b>这个页面还没有截图</b><p>验收后，将在这里显示 ${esc(targetName())} ${web ? '浏览器' : '原生'}运行截图。</p></div>`);
    $('#zoom-button').disabled = !image;
    renderHtml($('#thumbnails'), images.map((item, index) => `<button data-image="${index}" aria-label="查看${esc(item.title)}" aria-pressed="${imageIndex === index}" title="${esc(item.title)}"><img src="${esc(item.asset)}" alt=""></button>`).join(''));
    $('#image-caption').textContent = image ? `${image.title} · ${image.width} × ${image.height}` : '待验收时仍保留页面及检查项';
    const details = data.coverage[platform].pages.find(item => item.id === page.id);
    const unresolved = details.scenarios.filter(scene => scene.required !== false && scene.verdict !== 'PASS');
    const owner = data.cases.find(item => item.id === image?.caseId);
    const intro = image?.note || '按必需场景逐项验收。图片审阅与执行结果独立保留，历史或辅助截图不补齐当前结果。';
    renderHtml($('#checks-panel'), `<h3>画面与场景</h3><p class="scene-description">${esc(intro)}</p><h3>当前环境场景</h3>${checklist(page, image)}<div class="detail-notice ${unresolved.length ? '' : 'neutral'}"><b>${icon(unresolved.length ? 'circle-alert' : 'info')}${unresolved.length ? '仍需处理' : '覆盖范围'}</b>${unresolved.length ? unresolved.map(scene => `${esc(scene.title)}：${esc(scene.reason)}`).join('<br>') : '当前清单内的必需场景已具备对应执行结果与审阅证据。清单以外的设备、数据模式与场景保持未知。'}</div>${owner ? `<p class="raw-meta">选中截图关联执行：${esc(owner.verdict)} · ${web ? 'test ' + esc(owner.testStatus || '未知') + ' / batch exit ' + esc(owner.batchExitCode ?? '未知') : 'exit ' + esc(owner.exitCode ?? '未知')}。${esc(owner.reason || '')}</p>` : ''}${page.aliases?.length ? `<p class="raw-meta">合并的别名：${page.aliases.map(esc).join('、')}</p>` : ''}`);
    if (owner?.annotations?.length) renderHtml($('#checks-panel'), `<h3>补充说明</h3>${owner.annotations.map(note => `<p class="scene-description">${esc(note.text)}<br><small>${esc(note.reviewer.id)} · ${esc(note.reviewer.model)} · ${esc(note.reviewer.method)}</small></p>`).join('')}`, true);
    const reviewer = image?.reviewHistory?.at(-1)?.reviewer;
    const rows = [
      ['运行环境', targetName()], ['页面结果', stateFor(page)], ['目录源码', data.inventoryCommit],
      ['运行设备', run?.device || '未知'], ['系统 / 配置', `${run?.os || '未知'} / ${run?.profile || '未知'}`],
      ['证据类型', image ? `${image.renderer} / ${image.kind}` : '无截图'], ['数据模式', run?.dataMode || '未知'],
      ['证据源码', run?.source ? `${run.source.commit || '未知'} / dirty=${run.source.dirty ?? '未知'}` : '未知'],
      [web ? '源码核对' : '源码/包绑定', web ? (run?.sourceVerified ? '冻结源码与任务自有Web服务已核对' : '外部站点或源码未核对') : run?.bindingCopy || '未提供'], ['执行用例', owner ? `${owner.id} / ${owner.verdict} / ${web ? owner.testStatus || '未知' : 'exit ' + (owner.exitCode ?? '未知')}` : '未关联'],
      ['执行命令', owner?.command || '未执行'], ['视觉审阅者', reviewer ? `${reviewer.id} / ${reviewer.model} / ${reviewer.method}` : '未记录'],
      ...(web ? [['浏览器', run?.browser || '未知'], ['视口', run?.viewport ? `${run.viewport.width} × ${run.viewport.height}` : '未知'], ['站点 origin', run?.origin || '未知'], ['批次退出码', owner?.batchExitCode ?? '未知']] : []),
      ['图片审阅', image?.review || '未知'], ['图片来源', image?.original || '未提供'], ['图片 SHA-256', image?.sha256 || '未提供'],
    ];
    renderHtml($('#evidence-panel'), `<dl class="provenance">${rows.map(([name, value]) => `<div><dt>${esc(name)}</dt><dd><code>${esc(value)}</code></dd></div>`).join('')}</dl>${image ? `<a class="button" href="${esc(image.asset)}" download="${esc(image.id)}.png">${icon('download')}下载原始 PNG</a>` : ''}${owner?.receiptCopy ? `<a class="evidence-link" href="${esc(owner.receiptCopy)}">${icon('file-text')}原始场景执行回执</a>` : ''}${run?.bindingCopy ? `<a class="evidence-link" href="${esc(run.bindingCopy)}">${icon('file-text')}源码 / 构建 / 安装绑定回执</a>` : ''}<p class="raw-meta">文件摘要记录实际输入字节。界面不验证作者的来源声明；具体环境和场景以回执为准。</p>`);
    selectTab(currentTab);
    const index = visiblePages.findIndex(item => item.id === page.id);
    $('#detail-index').textContent = `页面 ${index + 1} / ${visiblePages.length}`;
    $('#prev-page').disabled = index <= 0;
    $('#next-page').disabled = index >= visiblePages.length - 1;
    if (!$('#detail-dialog').open) $('#detail-dialog').showModal();
  }
  function selectTab(tab) {
    currentTab = tab;
    for (const name of ['checks', 'evidence']) {
      const active = name === tab;
      $(`#tab-${name}`).setAttribute('aria-selected', active);
      $(`#tab-${name}`).tabIndex = active ? 0 : -1;
      $(`#${name}-panel`).hidden = !active;
    }
  }
  function reset() { group = 'all'; status = 'all'; search = ''; $('#search').value = ''; render(); }
  document.addEventListener('click', event => {
    const scopeButton = event.target.closest('[data-scope]');
    if (scopeButton) changeScope(scopeButton.dataset.scope);
    const groupButton = event.target.closest('[data-group]');
    if (groupButton) { group = groupButton.dataset.group; render(); }
    const platformButton = event.target.closest('[data-platform]');
    if (platformButton) { platform = platformButton.dataset.platform; render(); }
    const statusButton = event.target.closest('[data-status]');
    if (statusButton) { status = statusButton.dataset.status; render(); }
    const card = event.target.closest('[data-page]');
    if (card) showDetail(card.dataset.page);
    const thumbnail = event.target.closest('[data-image]');
    if (thumbnail) {
      const index = Number(thumbnail.dataset.image);
      showDetail(currentPage.id, index, true);
      $(`[data-image="${index}"]`).focus();
    }
  });
  $('#search').addEventListener('input', event => { search = event.target.value; render(); });
  $('#reset-button').addEventListener('click', reset);
  $('.brand').addEventListener('click', event => { event.preventDefault(); reset(); window.scrollTo({ top: 0 }); });
  $('.close-detail').addEventListener('click', () => $('#detail-dialog').close());
  for (const name of ['checks', 'evidence']) $(`#tab-${name}`).addEventListener('click', () => selectTab(name));
  $('.detail-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'checks' : event.key === 'End' ? 'evidence' : currentTab === 'checks' ? 'evidence' : 'checks';
    selectTab(next); $(`#tab-${next}`).focus();
  });
  if (combined) $('.scope-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'app' : event.key === 'End' ? 'web' : scope === 'app' ? 'web' : 'app';
    changeScope(next); $(`[data-scope="${next}"]`).focus();
  });
  for (const [id, delta] of [['prev-page', -1], ['next-page', 1]]) $(`#${id}`).addEventListener('click', () => {
    const index = visiblePages.findIndex(page => page.id === currentPage.id);
    if (visiblePages[index + delta]) { showDetail(visiblePages[index + delta].id); $('.detail-scroll').scrollTop = 0; $('#detail-dialog').scrollTop = 0; }
  });
  $('#zoom-button').addEventListener('click', () => {
    const image = imagesFor(currentPage)[currentImage];
    if (!image) return;
    $('#zoom-image').src = image.asset;
    $('#zoom-image').alt = image.title;
    $('#zoom-dialog').showModal();
  });
  $('#close-zoom').addEventListener('click', () => $('#zoom-dialog').close());
  const openAbout = () => $('#about-dialog').showModal();
  $('#about-button').addEventListener('click', openAbout);
  $('#scope-button').addEventListener('click', openAbout);
  $('#close-about').addEventListener('click', () => $('#about-dialog').close());
  $('#understood').addEventListener('click', () => $('#about-dialog').close());
  $$('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  }));
  document.addEventListener('keydown', event => {
    const activeDialog = $$('dialog[open]').at(-1);
    if (event.key === 'Tab' && activeDialog) {
      const stops = [...activeDialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')].filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0);
      const index = stops.indexOf(document.activeElement);
      if (stops.length && (index === -1 || (event.shiftKey && index === 0) || (!event.shiftKey && index === stops.length - 1))) {
        event.preventDefault();
        (event.shiftKey ? stops.at(-1) : stops[0]).focus();
      }
    }
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !/INPUT|TEXTAREA/.test(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); $('#search').focus(); }
  });
  $('#theme-button').addEventListener('click', () => {
    const root = document.documentElement;
    const currentlyDark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches;
    root.dataset.theme = currentlyDark ? 'light' : 'dark';
      renderHtml($('#theme-button'), icon(currentlyDark ? 'moon' : 'sun'));
  });
  $('#export-button').addEventListener('click', () => {
    const report = data.reports[platform];
    const inventory = {
      title: data.title, mode: data.mode, platform,
      note: '当前平台全部页面与场景；不受页面筛选影响。执行状态和图片审阅分别保留。',
      inventoryCommit: data.inventoryCommit, inventorySource: data.inventorySource, normalization: data.normalization,
      runs: report.runs, coverage: data.coverage[platform],
      pages: data.pages.map(page => ({ ...page, aggregate: stateFor(page), screenshots: imagesFor(page).map(({ asset, ...image }) => image) })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(inventory, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `imsweb-${platform}-page-inventory.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#toast').textContent = `已导出 ${targetName()} 全部 ${data.pages.length} 个页面的清单`;
    $('#toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3600);
  });
  replaceIcons();
  render();
});
