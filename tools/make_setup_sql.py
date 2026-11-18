"""대시보드용 data.json -> Supabase setup.sql

사용법:
  python tools/make_setup_sql.py public/data.json supabase/setup.sql

- 테이블 4개(기준표, 실적월, 공구별 검토, 판정)와 조회 전용 RLS 정책을 만들고 data.json 내용을 넣습니다.
- 다시 실행해도 Supabase에서 직접 고친 값은 덮어쓰지 않습니다(on conflict do nothing).
- 실제 업무 자료를 공개 DB에 넣지 마세요. 이 저장소와 배포 사이트는 누구나 볼 수 있습니다.
"""
import json
import sys

VERDICTS = ["이행", "미흡", "보고서에 없음", "확인 필요", "해당 시기 아님"]
CAUSES = ["기준 미확정", "보고서에서 못 찾음", "과업 범위 확인"]
TABLES = ["bim_criteria", "bim_review_months", "bim_review_groups", "bim_verdicts"]


def q(value):
    """SQL 문자열 리터럴 (None -> null)."""
    if value is None:
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def j(value):
    return q(json.dumps(value if value is not None else [], ensure_ascii=False)) + "::jsonb"


def values(rows):
    return ",\n".join("  (" + ", ".join(r) + ")" for r in rows)


SCHEMA = f"""-- BIM 용역 월간 검토 현황 대시보드: Supabase SQL Editor에서 전체를 실행하세요.
-- 이 파일은 tools/make_setup_sql.py가 public/data.json에서 만든 것입니다.
-- 교육용 가상 데이터만 들어 있습니다. 실제 과업지시서·보고서·용역사 자료를 넣지 마세요(누구나 조회 가능).
-- 다시 실행해도 Table Editor에서 직접 고친 값은 덮어쓰지 않습니다.

create table if not exists public.bim_criteria (
  id text primary key,
  sort_order int not null,
  group_name text not null,
  name text not null,
  cycle text not null default '',
  basis text not null default ''
);

create table if not exists public.bim_review_months (
  month text primary key,
  review_date text,
  note text,
  is_sample boolean not null default true
);

create table if not exists public.bim_review_groups (
  month text not null references public.bim_review_months(month) on delete cascade,
  group_name text not null,
  sort_order int not null,
  report text,
  start_date text,
  submit_date text,
  stage int not null default 1 check (stage between 0 and 4), -- 0 접수, 1 AI 초안, 2 판정 확정, 3 보완 요청 발송, 4 기성 의견 제출
  warnings jsonb not null default '[]'::jsonb,
  priority jsonb not null default '[]'::jsonb,
  request_title text,
  request_items jsonb not null default '[]'::jsonb,
  memo jsonb not null default '[]'::jsonb,
  primary key (month, group_name)
);

create table if not exists public.bim_verdicts (
  month text not null,
  group_name text not null,
  item_id text not null references public.bim_criteria(id),
  verdict text not null check (verdict in ({", ".join(q(v) for v in VERDICTS)})),
  evidence text not null default '',
  reason text not null default '',
  cause text check (cause is null or cause in ({", ".join(q(c) for c in CAUSES)})),
  primary key (month, group_name, item_id),
  foreign key (month, group_name) references public.bim_review_groups(month, group_name) on delete cascade
);

-- 공개 사이트에서 읽기만 가능하도록 행 단위 보안을 켜고, 방문자(anon)에게 조회 권한만 줍니다.
"""


def rls(table):
    return f"""alter table public.{table} enable row level security;
revoke all on table public.{table} from anon, authenticated;
grant select on table public.{table} to anon;
drop policy if exists "lab_public_read_only" on public.{table};
create policy "lab_public_read_only" on public.{table} for select to anon using (true);
"""


def build(data):
    out = [SCHEMA] + [rls(t) for t in TABLES]

    crit = [[q(c["id"]), str(i + 1), q(c.get("group")), q(c.get("name")), q(c.get("cycle") or ""), q(c.get("basis") or "")]
            for i, c in enumerate(data["criteria"])]
    out.append("\n-- 과업 기준표 (가상)\ninsert into public.bim_criteria (id, sort_order, group_name, name, cycle, basis) values\n"
               + values(crit) + "\non conflict (id) do nothing;\n")

    is_sample = "true" if data.get("isSample", True) else "false"
    months, groups, verdicts = [], [], []
    for m in data["months"]:
        months.append([q(m["month"]), q(m.get("reviewDate")), q(m.get("note")), is_sample])
        for gi, g in enumerate(m["groups"]):
            req = g.get("request") or {}
            groups.append([q(m["month"]), q(g["name"]), str(gi + 1), q(g.get("report")), q(g.get("startDate")),
                           q(g.get("submitDate")), str(int(g.get("stage", 1))), j(g.get("warnings")), j(g.get("priority")),
                           q(req.get("title")), j(req.get("items")), j(g.get("memo"))])
            for v in g["verdicts"]:
                if v["verdict"] not in VERDICTS:
                    raise ValueError(f"알 수 없는 판정: {g['name']} {v['id']} {v['verdict']}")
                verdicts.append([q(m["month"]), q(g["name"]), q(v["id"]), q(v["verdict"]),
                                 q(v.get("evidence") or ""), q(v.get("reason") or ""), q(v.get("cause"))])

    out.append("\n-- 실적월\ninsert into public.bim_review_months (month, review_date, note, is_sample) values\n"
               + values(months) + "\non conflict (month) do nothing;\n")
    out.append("\n-- 공구별 검토 (진행 단계, 보완 요청, 우선 과업, 메모)\n"
               "insert into public.bim_review_groups (month, group_name, sort_order, report, start_date, submit_date, stage, warnings, priority, request_title, request_items, memo) values\n"
               + values(groups) + "\non conflict (month, group_name) do nothing;\n")
    out.append("\n-- 공구 × 과업 판정 (AI 초안)\ninsert into public.bim_verdicts (month, group_name, item_id, verdict, evidence, reason, cause) values\n"
               + values(verdicts) + "\non conflict (month, group_name, item_id) do nothing;\n")
    out.append("""
-- 실습 확인: 공구별 판정 수가 기준표 항목 수와 같은지 확인하세요.
select v.month, v.group_name, count(*) as verdicts,
       count(*) filter (where v.verdict = '이행') as done,
       count(*) filter (where v.verdict = '미흡') as weak
from public.bim_verdicts v group by v.month, v.group_name order by v.month, v.group_name;
""")
    return "".join(out), len(crit), len(months), len(groups), len(verdicts)


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)
    sql, nc, nm, ng, nv = build(data)
    with open(sys.argv[2], "w", encoding="utf-8", newline="\n") as f:
        f.write(sql)
    print(f"저장: {sys.argv[2]} (기준표 {nc}, 실적월 {nm}, 공구 {ng}, 판정 {nv})")


if __name__ == "__main__":
    main()
