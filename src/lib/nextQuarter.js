// 다음 분기 추진 BIM 과업 — ⚠ 교육용 "가상 기준"입니다. 실제 과업지시서·지침의 기준이 아닙니다.
//
// 공구별로 이번 실적월의 판정과 기준표의 검토주기를 조합해, 아래 규칙 순서대로 과업을 고릅니다.
// 한 과업이 여러 규칙에 해당하면 먼저 나오는 규칙 하나만 적용합니다.
// 판정은 DB(또는 data.json)에서 오므로, Supabase에서 판정을 고치면 이 목록도 함께 바뀝니다.

export const RULES = [
  { key: 'fix', tag: '보완', cls: 'v-미흡', title: '미흡 과업 보완 완료', desc: '이번 달 판정이 "미흡"인 과업은 다음 분기 첫 달 안에 보완을 마칩니다.' },
  { key: 'deadline', tag: '기한', cls: 'v-미흡', title: '기한 과업 완료', desc: '검토주기가 "기한"인데 아직 "이행"이 아닌 과업(해당 시기 아님 제외)은 분기 안에 끝냅니다.' },
  { key: 'periodic', tag: '일정', cls: 'v-일정', title: '분기·반기 정기 과업', desc: '검토주기가 "분기"인 과업은 직전 분기분을 분기 첫 달에 제출하고, "반기"인 과업은 해당 반기 안에 1회 이상 실시합니다.' },
  { key: 'check', tag: '확인', cls: 'v-확인', title: '실적 확인·보고 반영', desc: '"확인 필요" 중 보고서에서 실적을 못 찾은 과업은 수행 여부를 확인하고 월간 실적보고서에 반영하도록 요청합니다.' },
  { key: 'agree', tag: '협의', cls: 'v-해당', title: '기준·범위 협의 후 일정 확정', desc: '검토주기가 정해지지 않았거나 과업 범위 확인이 필요한 과업은 분기 안에 기한·수준을 협의해 일정을 확정합니다.' },
]

const ROUTINE_CYCLES = ['매월', '상시']
const EVENT_CYCLES = ['발생 시']

// '2026-10' -> { label: '2027년 1분기', period: '2027.01~03', prevLabel: '2026년 4분기', half: '2027년 상반기' }
export function nextQuarterOf(month) {
  const [y, mo] = String(month).split('-').map(Number)
  const q = Math.floor(((mo || 1) - 1) / 3) + 1
  const ny = q === 4 ? y + 1 : y
  const nq = q === 4 ? 1 : q + 1
  const first = (nq - 1) * 3 + 1
  const pad = n => String(n).padStart(2, '0')
  return {
    label: `${ny}년 ${nq}분기`,
    period: `${ny}.${pad(first)}~${pad(first + 2)}`,
    prevLabel: `${y}년 ${q}분기`,
    half: `${ny}년 ${nq <= 2 ? '상' : '하'}반기`,
    firstMonth: `${first}월`,
  }
}

function pickRule(c, v) {
  const cycle = c.cycle || ''
  if (v.verdict === '미흡') return 'fix'
  if (cycle === '기한' && v.verdict !== '이행' && v.verdict !== '해당 시기 아님') return 'deadline'
  if (cycle === '분기' || cycle === '반기') return 'periodic'
  if (v.verdict === '확인 필요' && v.cause === '보고서에서 못 찾음') return 'check'
  if (!cycle || (v.verdict === '확인 필요' && v.cause === '과업 범위 확인')) return 'agree'
  return null
}

function actionText(rule, c, nq) {
  switch (rule) {
    case 'fix': return '미흡 사항 보완 완료'
    case 'deadline': return '기한 내 완료·제출'
    case 'periodic': return c.cycle === '분기'
      ? `${nq.prevLabel}분 ${nq.firstMonth} 제출`
      : `${nq.half} 1회 이상 실시 (분기 내 계획 수립)`
    case 'check': return '수행 여부 확인 후 보고서 반영'
    case 'agree': return c.cycle ? '과업 범위 확정' : '작성 기한·수준 협의 후 일정 확정'
    default: return ''
  }
}

// 공구 하나의 다음 분기 과업 계획
export function planFor(group, criteria, month) {
  const nq = nextQuarterOf(month)
  const byId = Object.fromEntries(criteria.map(c => [c.id, c]))
  const items = []
  let routine = 0
  let events = 0
  for (const v of group.verdicts) {
    const c = byId[v.id]
    if (!c) continue
    const rule = pickRule(c, v)
    if (rule) {
      items.push({ rule, id: c.id, name: c.name, action: actionText(rule, c, nq), reason: v.reason, evidence: v.evidence })
    } else if (ROUTINE_CYCLES.includes(c.cycle)) {
      routine++
    } else if (EVENT_CYCLES.includes(c.cycle)) {
      events++
    }
  }
  const order = Object.fromEntries(RULES.map((r, i) => [r.key, i]))
  items.sort((a, b) => order[a.rule] - order[b.rule] || a.id.localeCompare(b.id))
  return { quarter: nq, items, routine, events }
}
