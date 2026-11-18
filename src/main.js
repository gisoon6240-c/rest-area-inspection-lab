import { dataSource, loadData } from './lib/loadData.js'
import { RULES, nextQuarterOf, planFor } from './lib/nextQuarter.js'

const VERDICTS = [
  { key: '이행', cls: 'v-이행', icon: '✓' },
  { key: '미흡', cls: 'v-미흡', icon: '✕' },
  { key: '보고서에 없음', cls: 'v-없음', icon: '∅' },
  { key: '확인 필요', cls: 'v-확인', icon: '?' },
  { key: '해당 시기 아님', cls: 'v-해당', icon: '–' },
]
const VMAP = Object.fromEntries(VERDICTS.map(v => [v.key, v]))
const UNKNOWN = { key: '알 수 없음', cls: 'v-해당', icon: '!' }
const vinfo = key => VMAP[key] ?? UNKNOWN
const STAGES = ['보고서 접수', 'AI 초안', '판정 확정', '보완 요청 발송', '기성 의견 제출']
const CAUSES = ['기준 미확정', '보고서에서 못 찾음', '과업 범위 확인']
const state = { data: null, month: null, filter: null, group: null }

/* 공구 선택: 주소 끝의 #1공구 처럼 공구를 지정하면 그 공구만 보여 줍니다 (담당자별 바로가기 링크). */
function groupFromHash() {
  try { return decodeURIComponent(location.hash.slice(1)) || null } catch { return null }
}
state.group = groupFromHash()
const $ = s => document.querySelector(s)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const icon = v => `<span class="icon ${vinfo(v).cls}" aria-hidden="true">${vinfo(v).icon}</span>`
const stageName = n => STAGES[Math.min(Math.max(Number(n) || 0, 0), STAGES.length - 1)]

/* 테마 */
const THEMES = ['auto', 'light', 'dark']
const THEME_LABEL = { auto: '자동', light: '밝게', dark: '어둡게' }
function applyTheme(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', t)
  $('#theme').textContent = '테마: ' + THEME_LABEL[t]
  try { localStorage.setItem('theme', t) } catch { /* 저장 불가 환경 무시 */ }
}
let theme = 'auto'
try { theme = localStorage.getItem('theme') || 'auto' } catch { /* 무시 */ }
if (!THEMES.includes(theme)) theme = 'auto'
applyTheme(theme)
$('#theme').addEventListener('click', () => { theme = THEMES[(THEMES.indexOf(theme) + 1) % 3]; applyTheme(theme) })

function current() { return state.data.months.find(m => m.month === state.month) }
// 선택한 공구만 남긴 실적월 (전체 보기면 그대로)
function view() {
  const m = current()
  if (!state.group) return m
  return { ...m, groups: m.groups.filter(g => g.name === state.group) }
}

function selectGroup(name) {
  state.group = name
  const hash = name ? '#' + encodeURIComponent(name) : ''
  history.replaceState(null, '', location.pathname + location.search + hash)
  render()
}

function renderGroupbar(m) {
  const bar = $('#groupbar')
  const btn = (name, label) => `<button type="button" data-g="${esc(name ?? '')}" aria-pressed="${state.group === name}">${esc(label)}</button>`
  bar.innerHTML = '<span class="lbl">공구 선택</span>' + btn(null, '전체') + m.groups.map(g => btn(g.name, g.name)).join('')
    + `<span class="hint">${state.group ? `${esc(state.group)} 담당자용 바로가기: 지금 주소창의 주소를 즐겨찾기하거나 공유하세요.` : '공구 버튼을 누르면 해당 공구 내용만 볼 수 있습니다.'}</span>`
  bar.hidden = false
  bar.querySelectorAll('button').forEach(b => b.addEventListener('click', () => selectGroup(b.dataset.g || null)))
}
function count(list) {
  const c = Object.fromEntries(VERDICTS.map(v => [v.key, 0]))
  list.forEach(v => { if (v.verdict in c) c[v.verdict]++ })
  return c
}

function renderTiles(m) {
  const all = m.groups.flatMap(g => g.verdicts)
  const c = count(all)
  const req = m.groups.reduce((s, g) => s + g.request.items.length, 0)
  const warns = m.groups.reduce((s, g) => s + g.warnings.length, 0)
  const first = state.group
    ? { label: '선택한 공구', value: esc(state.group), foot: `과업 항목 ${state.data.criteria.length}개 · 진행: ${stageName(m.groups[0]?.stage)}` }
    : { label: '검토한 공구', value: `${m.groups.length}<span style="font-size:16px;color:var(--muted)"> / 4</span>`, foot: `과업 항목 ${state.data.criteria.length}개 × 공구` }
  const tiles = [
    first,
    { label: `${icon('미흡')} 미흡`, value: c['미흡'], foot: '보완 요청·우선 과업 대상' },
    { label: `${icon('확인 필요')} 확인 필요`, value: c['확인 필요'], foot: '원인별로 아래에 정리' },
    { label: `${icon('이행')} 이행`, value: c['이행'], foot: `해당 시기 아님 ${c['해당 시기 아님']}건 제외` },
    { label: '보완 요청 항목', value: req, foot: warns ? `경고 ${warns}건 (가리지 않은 개인정보 등)` : '경고 없음' },
  ]
  $('#tiles').innerHTML = tiles.map(t =>
    `<div class="card tile"><div class="label">${t.label}</div><div class="value">${t.value}</div><div class="foot">${esc(t.foot)}</div></div>`).join('')
}

const RULE_MAP = Object.fromEntries(RULES.map(r => [r.key, r]))

function renderPlan(m) {
  const nq = nextQuarterOf(m.month)
  $('#planTitle').textContent = `다음 분기 추진 BIM 과업 · ${nq.label}`
  $('#planCap').textContent = `${nq.period} · ${m.month} 판정과 기준표 검토주기에 가상 기준을 적용해 공구별로 정리했습니다.`
  $('#planRules').innerHTML = RULES.map(r => `<li><span class="icon ${r.cls}" style="width:auto;padding:0 4px">${r.tag}</span> <b>${esc(r.title)}</b> — ${esc(r.desc)}</li>`).join('')
    + '<li>그 밖의 매월·상시 과업은 계속 수행(건수만 표시)하고, 발생 시 과업은 사유가 생기면 대응합니다.</li>'
  $('#plan').innerHTML = m.groups.map(g => {
    const p = planFor(g, state.data.criteria, m.month)
    const counts = RULES.map(r => [r, p.items.filter(i => i.rule === r.key).length]).filter(([, n]) => n)
    const list = p.items.length
      ? `<ul>${p.items.map(i => {
        const r = RULE_MAP[i.rule]
        const tipText = [i.reason, i.evidence && `근거: ${i.evidence}`].filter(Boolean).join(' / ')
        return `<li><span class="tag ${r.cls}">${r.tag}</span><div><div class="what"><span class="id">${esc(i.id)}</span>${esc(i.name)}</div><div class="act" title="${esc(tipText)}">${esc(i.action)}</div></div></li>`
      }).join('')}</ul>`
      : '<div class="empty">추진할 과업이 없습니다.</div>'
    return `<article class="plan-card" aria-label="${esc(g.name)} ${esc(nq.label)} 추진 과업">
      <h3>${esc(g.name)}<span class="n">${p.items.length}건</span></h3>
      <div class="counts">${counts.map(([r, n]) => `<span class="${r.cls}">${r.tag} ${n}</span>`).join('')}</div>
      ${list}
      <div class="foot">그 밖에 매월·상시 과업 ${p.routine}건 지속 · 발생 시 과업 ${p.events}건 대응</div>
    </article>`
  }).join('')
}

function renderDist(m) {
  $('#legend').innerHTML = VERDICTS.map(v => `<span>${icon(v.key)}${v.key}</span>`).join('')
  const total = state.data.criteria.length || 1
  $('#dist').innerHTML = m.groups.map(g => {
    const c = count(g.verdicts)
    const segs = VERDICTS.filter(v => c[v.key]).map(v => {
      const pct = c[v.key] / total * 100
      const label = pct >= 8 ? c[v.key] : ''
      return `<div class="${v.cls}" style="width:${pct}%" data-tip="${esc(g.name)} · ${v.key} ${c[v.key]}건 (${Math.round(pct)}%)">${label}</div>`
    }).join('')
    return `<div class="seg-row"><div class="name">${esc(g.name)}</div><div class="seg" role="img" aria-label="${esc(g.name)}: ${VERDICTS.map(v => v.key + ' ' + c[v.key]).join(', ')}">${segs}</div></div>`
  }).join('')
  $('#distTable').innerHTML = `<table class="data"><thead><tr><th>공구</th>${VERDICTS.map(v => `<th class="num">${v.key}</th>`).join('')}</tr></thead><tbody>${
    m.groups.map(g => { const c = count(g.verdicts); return `<tr><td>${esc(g.name)}</td>${VERDICTS.map(v => `<td class="num">${c[v.key]}</td>`).join('')}</tr>` }).join('')}</tbody></table>`
}

function renderStages(m) {
  $('#stages').innerHTML = m.groups.map(g => `
    <div class="stage-row">
      <div class="name" style="font-weight:600;font-size:13px">${esc(g.name)}</div>
      <div>
        <div class="steps" role="img" aria-label="${esc(g.name)}: ${stageName(g.stage)} 단계">${STAGES.map((s, i) => `<div class="step ${i <= g.stage ? 'done' : ''}"></div>`).join('')}</div>
        <div class="stage-now">현재: ${stageName(g.stage)} · 제출 ${esc(g.submitDate)}</div>
      </div>
    </div>`).join('')
}

function itemName(id) { return (state.data.criteria.find(c => c.id === id) || {}).name || id }

function renderIssues(m) {
  const rows = m.groups.flatMap(g => g.verdicts.filter(v => v.verdict === '미흡').map(v => ({ g, v })))
  $('#issues').innerHTML = rows.length ? rows.map(({ g, v }) => `
    <li>${icon('미흡')}<div><div class="what">${esc(g.name)} · ${esc(v.id)} ${esc(itemName(v.id))}</div>
    <div class="why">${esc(v.reason)} ${v.evidence ? '(' + esc(v.evidence) + ')' : ''}</div></div></li>`).join('')
    : '<li class="empty">미흡 항목이 없습니다.</li>'
}

// 원인은 '확인 필요' 판정에만 의미가 있습니다. DB에서 판정을 바꾸면 원인 집계에서 자동으로 빠집니다.
const causeOf = v => (v.verdict === '확인 필요' ? v.cause : null)

function renderCauses(m) {
  const c = Object.fromEntries(CAUSES.map(k => [k, 0]))
  m.groups.forEach(g => g.verdicts.forEach(v => { const k = causeOf(v); if (k in c) c[k]++ }))
  const max = Math.max(1, ...Object.values(c))
  $('#causes').innerHTML = CAUSES.map(k => `
    <div class="hbar"><div>${k}</div><div class="track base"><div class="fill" style="width:${c[k] / max * 100}%" data-tip="${k} ${c[k]}건"></div></div><div class="n">${c[k]}</div></div>`).join('')
}

function renderFilters() {
  const btn = (key, label) => `<button type="button" class="chip" data-f="${key ?? ''}" aria-pressed="${state.filter === key}">${key ? icon(key) : ''}${label}</button>`
  $('#filters').innerHTML = btn(null, '전체') + VERDICTS.map(v => btn(v.key, v.key)).join('')
  $('#filters').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
    state.filter = b.dataset.f || null; renderFilters(); renderMatrix(view())
  }))
}

function renderMatrix(m) {
  const head = `<thead><tr><th>과업 항목</th>${m.groups.map(g => `<th class="g">${esc(g.name)}</th>`).join('')}</tr></thead>`
  let lastGroup = null
  const body = state.data.criteria.map(c => {
    const gh = c.group !== lastGroup ? `<tr class="grouphead"><td colspan="${m.groups.length + 1}">${esc(c.group)}</td></tr>` : ''
    lastGroup = c.group
    const cells = m.groups.map((g, gi) => {
      const v = g.verdicts.find(x => x.id === c.id)
      if (!v) return '<td><span class="empty">—</span></td>'
      const vm = vinfo(v.verdict)
      const dim = state.filter && state.filter !== v.verdict ? ' dim' : ''
      return `<td><button type="button" class="cell ${vm.cls}${dim}" data-g="${gi}" data-id="${esc(c.id)}" aria-label="${esc(g.name)} ${esc(c.id)} ${esc(v.verdict)}">${vm.icon}</button></td>`
    }).join('')
    return gh + `<tr><td class="item"><span class="id">${esc(c.id)}</span>${esc(c.name)}<span class="cyc">${c.cycle ? '· ' + esc(c.cycle) : '· 주기 미확정'}</span></td>${cells}</tr>`
  }).join('')
  $('#matrix').innerHTML = head + `<tbody>${body}</tbody>`
  $('#matrix').querySelectorAll('.cell').forEach(b => {
    const g = m.groups[+b.dataset.g], v = g.verdicts.find(x => x.id === b.dataset.id)
    b.addEventListener('mouseenter', e => showTip(e, `<div class="t">${icon(v.verdict)}${esc(g.name)} · ${esc(v.id)} ${esc(itemName(v.id))}</div><div class="r">${esc(v.reason)}</div>${v.evidence ? `<div class="e">근거: ${esc(v.evidence)}</div>` : ''}`))
    b.addEventListener('mousemove', moveTip)
    b.addEventListener('mouseleave', hideTip)
    b.addEventListener('click', () => showDetail(g, v))
  })
}

function showDetail(g, v) {
  const c = state.data.criteria.find(x => x.id === v.id) || {}
  const d = $('#detail')
  d.innerHTML = `<h3>${icon(v.verdict)}${esc(g.name)} · ${esc(v.id)} ${esc(c.name)} — ${esc(v.verdict)}</h3>
    <dl><dt>판정 이유</dt><dd>${esc(v.reason)}</dd>
    <dt>근거</dt><dd>${esc(v.evidence || '—')}</dd>
    <dt>검토주기</dt><dd>${esc(c.cycle || '미확정')}</dd>
    <dt>기준 근거</dt><dd>${esc(c.basis)}</dd>
    ${causeOf(v) ? `<dt>원인</dt><dd>${esc(causeOf(v))}</dd>` : ''}</dl>`
  d.classList.add('show')
}

function renderRequests(m) {
  $('#requests').innerHTML = m.groups.map(g => `
    <details class="req"${state.group ? ' open' : ''}>
      <summary><span>${esc(g.name)}</span><span class="cnt">보완 요청 ${g.request.items.length}건 · 우선 과업 ${g.priority.length}건</span></summary>
      ${g.warnings.length ? `<div class="warn">⚠ ${g.warnings.map(esc).join(' / ')}</div>` : ''}
      <h4>보완 요청 메일 제목</h4><div style="font-size:13px">${esc(g.request.title) || '—'}</div>
      <h4>보완 요청 항목</h4>${g.request.items.length ? `<ul>${g.request.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<div class="empty">없음</div>'}
      <h4>다음 차수 우선 과업</h4>${g.priority.length ? `<ul>${g.priority.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<div class="empty">없음</div>'}
      <h4>내부 메모</h4>${g.memo.length ? `<ul>${g.memo.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<div class="empty">없음</div>'}
    </details>`).join('')
}

/* tooltip */
const tip = $('#tip')
function showTip(e, html) { tip.innerHTML = html; tip.style.display = 'block'; moveTip(e) }
function moveTip(e) {
  const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight
  let x = e.clientX + pad, y = e.clientY + pad
  if (x + w > innerWidth - 8) x = e.clientX - w - pad
  if (y + h > innerHeight - 8) y = e.clientY - h - pad
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px'
}
function hideTip() { tip.style.display = 'none' }
document.addEventListener('mouseover', e => {
  const t = e.target.closest('[data-tip]')
  if (t && t.dataset.tip) showTip(e, esc(t.dataset.tip))
})
document.addEventListener('mouseout', e => { if (e.target.closest('[data-tip]')) hideTip() })

document.querySelectorAll('.toggle-table').forEach(b => b.addEventListener('click', () => {
  const t = document.getElementById(b.dataset.target), open = t.hidden
  t.hidden = !open; b.setAttribute('aria-expanded', open); b.textContent = open ? '그래프로 보기' : '표로 보기'
  $('#dist').hidden = open; $('#legend').hidden = open
}))

function render() {
  const all = current()
  if (state.group && !all.groups.some(g => g.name === state.group)) state.group = null
  const m = view()
  renderGroupbar(all)
  $('#sub').textContent = state.group
    ? `실적월 ${m.month} · 검토일 ${m.reviewDate} · ${state.group}만 보기`
    : `실적월 ${m.month} · 검토일 ${m.reviewDate} · 공구별 용역사 ${m.groups.length}곳`
  $('#causesCap').textContent = state.group ? `무엇을 정해야 풀리는지 (${state.group})` : `무엇을 정해야 풀리는지 (${m.groups.length}개 공구 합계)`
  $('#detail').classList.remove('show')
  renderTiles(m); renderPlan(m); renderDist(m); renderStages(m); renderIssues(m); renderCauses(m)
  renderFilters(); renderMatrix(m); renderRequests(m)
}

const SOURCE_LABEL = { demo: 'DEMO DATA', db: 'LIVE DB' }
function setSource(kind) {
  const el = $('#source')
  el.textContent = kind === 'error' ? '조회 오류' : kind === 'loading' ? '연결 중' : SOURCE_LABEL[kind]
  el.className = 'source' + (kind === 'db' ? ' live' : kind === 'error' ? ' error' : '')
}

function clearScreen() {
  for (const id of ['#tiles', '#plan', '#legend', '#dist', '#distTable', '#stages', '#issues', '#causes', '#filters', '#matrix', '#requests']) $(id).innerHTML = ''
  $('#detail').classList.remove('show')
  $('#month').innerHTML = ''
  $('#groupbar').hidden = true
}

async function refresh() {
  const btn = $('#refresh')
  btn.disabled = true; btn.textContent = '조회 중…'
  setSource('loading')
  $('#error').hidden = true
  try {
    const data = await loadData()
    if (!data.months?.length) throw new Error('표시할 실적월이 없습니다.')
    state.data = data
    if (!data.months.some(m => m.month === state.month)) state.month = data.months[data.months.length - 1].month
    $('#banner').hidden = !data.isSample
    $('#month').innerHTML = data.months.map(m => `<option value="${esc(m.month)}">${esc(m.month)} 실적</option>`).join('')
    $('#month').value = state.month
    const at = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    $('#footer').textContent = `기준표 항목 ${data.criteria.length}개 · 데이터: ${dataSource === 'db' ? 'Supabase DB' : 'data.json (가상)'} · 최종 조회 ${at} · 판정은 AI 초안이며 확정은 담당자가 합니다.`
    setSource(dataSource)
    render()
  } catch (err) {
    // DB 오류일 때 가상 데이터를 실제 DB 결과처럼 표시하지 않습니다.
    state.data = null
    clearScreen()
    setSource('error')
    $('#sub').textContent = '데이터를 불러오지 못했습니다.'
    $('#error').innerHTML = `<b>조회 실패</b> — 환경변수, Supabase 테이블(supabase/setup.sql), RLS 조회 정책을 확인한 뒤 다시 시도하세요.<br><code>${esc(err.message)}</code>`
    $('#error').hidden = false
  } finally {
    btn.disabled = false; btn.textContent = '데이터 새로고침'
  }
}

$('#month').addEventListener('change', e => { state.month = e.target.value; render() })
$('#refresh').addEventListener('click', () => { void refresh() })
window.addEventListener('hashchange', () => { state.group = groupFromHash(); if (state.data) render() })
void refresh()
