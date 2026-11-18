import { hasSupabaseConfig, supabase } from './supabaseClient.js'

// 환경변수가 없으면 public/data.json(교육용 가상 데이터)을, 있으면 Supabase DB를 읽습니다.
// DB 조회가 실패하면 가상 데이터로 바꿔치기하지 않고 오류를 그대로 보여 줍니다.
export const dataSource = hasSupabaseConfig ? 'db' : 'demo'

export async function loadData() {
  return hasSupabaseConfig ? loadFromSupabase() : loadFromJson()
}

async function loadFromJson() {
  const res = await fetch('/data.json', { cache: 'no-store' })
  if (!res.ok) throw new Error(`data.json을 불러오지 못했습니다 (${res.status})`)
  return res.json()
}

async function select(table, columns, order) {
  let query = supabase.from(table).select(columns)
  for (const col of order) query = query.order(col, { ascending: true })
  const { data, error } = await query
  if (error) throw new Error(`${table}: ${error.message}${error.code ? ` (${error.code})` : ''}`)
  return data ?? []
}

async function loadFromSupabase() {
  const [criteria, months, groups, verdicts] = await Promise.all([
    select('bim_criteria', 'id, group_name, name, cycle, basis', ['sort_order']),
    select('bim_review_months', 'month, review_date, note, is_sample', ['month']),
    select('bim_review_groups', 'month, group_name, report, start_date, submit_date, stage, warnings, priority, request_title, request_items, memo', ['month', 'sort_order']),
    select('bim_verdicts', 'month, group_name, item_id, verdict, evidence, reason, cause', ['month', 'group_name']),
  ])

  if (months.length === 0) throw new Error('bim_review_months 테이블에 실적월이 없습니다. supabase/setup.sql을 실행했는지 확인하세요.')

  return {
    isSample: months.some(m => m.is_sample),
    criteria: criteria.map(c => ({ id: c.id, group: c.group_name, name: c.name, cycle: c.cycle ?? '', basis: c.basis ?? '' })),
    months: months.map(m => ({
      month: m.month,
      reviewDate: m.review_date ?? '',
      note: m.note ?? '',
      groups: groups.filter(g => g.month === m.month).map(g => ({
        name: g.group_name,
        report: g.report ?? '',
        startDate: g.start_date ?? '',
        submitDate: g.submit_date ?? '',
        stage: g.stage ?? 0,
        warnings: g.warnings ?? [],
        priority: g.priority ?? [],
        request: { title: g.request_title ?? '', items: g.request_items ?? [] },
        memo: g.memo ?? [],
        verdicts: verdicts
          .filter(v => v.month === m.month && v.group_name === g.group_name)
          .map(v => ({ id: v.item_id, verdict: v.verdict, evidence: v.evidence ?? '', reason: v.reason ?? '', cause: v.cause })),
      })),
    })),
  }
}
