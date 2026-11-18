# BIM 용역 월간 검토 현황 대시보드

BIM 용역 월간 실적보고서 **적정성 검토 결과**(AI 판정 초안)를 4개 공구 × 과업 항목으로 한눈에 보는 대시보드입니다.
휴게소 시설점검 실습과 같은 흐름(**GitHub → Vercel 자동 배포 → Supabase DB 연결 → DB 수정 후 확인**)을 업무 자동화 결과물에 적용했습니다.

> ⚠ **교육용 가상 데이터만 사용합니다.** 이 저장소와 배포 사이트는 **누구나 볼 수 있습니다.**
> 실제 과업지시서, 월간 실적보고서, 용역사 검토 결과, 사람 이름·연락처를 이 저장소나 Supabase에 넣지 마세요.

## 화면 구성

| 영역 | 내용 |
| --- | --- |
| 요약 | 검토한 공구 수, 미흡·확인 필요·이행 건수, 보완 요청 항목 수, 경고 |
| 다음 분기 추진 BIM 과업 | 공구별로 다음 분기에 추진할 과업 (**가상 기준** 적용, 아래 참고) |
| 공구별 판정 분포 | 공구마다 판정 5단계 비율 (표로 보기 가능) |
| 검토 진행 단계 | 보고서 접수 → AI 초안 → 판정 확정 → 보완 요청 → 기성 의견 |
| 미흡 항목 / 확인 필요 원인 | 미흡 판정 목록, 확인 필요의 원인(기준 미확정·보고서에서 못 찾음·과업 범위 확인) |
| 공구 × 과업 비교표 | 판정 필터, 칸에 마우스를 올리면 이유, 누르면 상세 |
| 보완 요청 · 우선 과업 · 메모 | 공구별 결과물 초안 |

판정 5단계: **이행 / 미흡 / 보고서에 없음 / 확인 필요 / 해당 시기 아님**

### 다음 분기 추진 BIM 과업 (가상 기준)

실적월의 다음 분기(예: 2026-10 → **2027년 1분기**)에 공구별로 추진할 과업을, 판정과 기준표 검토주기로 **자동 계산**합니다.
규칙은 [`src/lib/nextQuarter.js`](src/lib/nextQuarter.js)에 있으며 위에서부터 먼저 맞는 하나만 적용합니다.

| 순서 | 표시 | 가상 기준 |
| --- | --- | --- |
| 1 | 보완 | 판정이 **미흡** → 다음 분기 첫 달 안에 보완 완료 |
| 2 | 기한 | 검토주기 **기한**인데 아직 이행이 아님(해당 시기 아님 제외) → 분기 안에 완료 |
| 3 | 일정 | 검토주기 **분기** → 직전 분기분을 첫 달에 제출 / **반기** → 해당 반기 안에 1회 이상 실시 |
| 4 | 확인 | **확인 필요** 중 보고서에서 못 찾음 → 수행 여부 확인 후 보고서 반영 |
| 5 | 협의 | 검토주기 **미확정**, 또는 과업 범위 확인 필요 → 기한·수준 협의 후 일정 확정 |

그 밖의 매월·상시 과업은 계속 수행(건수만 표시), 발생 시 과업은 사유가 생기면 대응합니다.
판정을 DB에서 바꾸면 목록도 다시 계산됩니다. **실제 과업지시서·본사 지침의 기준이 아닙니다.**

### 공구별 보기 (담당자용 바로가기)

화면 위쪽 **공구 선택** 버튼(전체 · 1공구 · 2공구 · 3공구 · 4공구)을 누르면 요약, 판정 분포, 진행 단계, 미흡 항목, 비교표, 보완 요청이 **그 공구 내용만** 표시됩니다.
주소 끝에 `#공구이름`을 붙이면 처음부터 그 공구 화면이 열리므로, 담당자에게 아래 주소를 즐겨찾기하도록 안내하세요.

| 공구 | 바로가기 주소 |
| --- | --- |
| 1공구 | `https://rest-area-inspection-lab-navy.vercel.app/#1공구` |
| 2공구 | `https://rest-area-inspection-lab-navy.vercel.app/#2공구` |
| 3공구 | `https://rest-area-inspection-lab-navy.vercel.app/#3공구` |
| 4공구 | `https://rest-area-inspection-lab-navy.vercel.app/#4공구` |

> 이 기능은 **보기 편의용**입니다. 접근 제한이 아니므로 누구나 다른 공구 버튼을 눌러 볼 수 있습니다.

## 1. 로컬 실행 (DB 없이 가능)

**준비물:** Node.js 20.19 이상

```bash
npm install
npm run dev
```

`http://127.0.0.1:5173/` 에 접속합니다. 환경변수가 없으면 `public/data.json`(가상 데이터)을 읽고 오른쪽 위에 **DEMO DATA**가 표시됩니다.

> Windows PowerShell에서 `npm`이 "스크립트를 실행할 수 없습니다" 오류로 막히면 `npm.cmd`, `npx.cmd`로 실행하세요.

## 2. Supabase DB 만들기

1. Supabase Dashboard → **SQL Editor**에서 [`supabase/setup.sql`](supabase/setup.sql) 전체를 붙여 넣고 **Run** 합니다.
2. 결과 창에 공구 4곳이 각각 **판정 27건**으로 나오면 성공입니다.
3. 만들어지는 테이블 (모두 조회 전용 RLS 정책 `lab_public_read_only` 적용)

| 테이블 | 내용 |
| --- | --- |
| `bim_criteria` | 공통 과업 기준표 (항목 ID, 구분, 과업 항목, 검토주기, 근거) |
| `bim_review_months` | 실적월, 검토일, 비고 |
| `bim_review_groups` | 공구별 진행 단계(`stage` 0~4), 경고, 보완 요청, 우선 과업, 메모 |
| `bim_verdicts` | 공구 × 과업 판정, 근거, 이유, 확인 필요 원인 |

> SQL을 다시 실행해도 Table Editor에서 직접 고친 값은 덮어쓰지 않습니다.

## 3. 환경변수 연결

`.env.example`을 복사해 `.env.local`을 만들고 값을 넣은 뒤 개발 서버를 **다시 시작**합니다.

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Vercel에는 **Settings → Environment Variables**에 같은 두 값을 **Config** 형식, **Production**으로 등록하고 Redeploy 합니다.
화면 오른쪽 위가 **LIVE DB**로 바뀌면 연결된 것입니다.

> Publishable key만 사용합니다. `sb_secret_`, `service_role` 키는 절대 넣지 마세요.

## 4. 최종 검증 (DB 수정 → 화면 반영)

1. Supabase → Table Editor → `bim_review_groups`에서 **1공구**의 `stage`를 `1` → **`2`**(판정 확정)로 바꿉니다.
2. Table Editor → `bim_verdicts`에서 **2공구 · T-11**의 `verdict`를 `미흡` → **`이행`**으로 바꿉니다.
3. 대시보드에서 **데이터 새로고침**을 누릅니다.
4. 1공구 진행 단계가 **판정 확정**까지 채워지고, 미흡 **9 → 8**, 이행 **48 → 49**가 되면 성공입니다.

## 5. 새 실적월 데이터 넣기 (가상 데이터)

`bim-monthly-review` 스킬이 만든 검토 JSON과 기준표 엑셀로 `data.json`을 갱신한 뒤 SQL을 다시 만듭니다.

```bash
python tools/build_dashboard_data.py <검토.json> <기준표.xlsx> public/data.json --append
python tools/make_setup_sql.py public/data.json supabase/setup.sql
```

새로 만든 `setup.sql`을 SQL Editor에서 다시 실행하면 새 실적월이 추가됩니다.

## 문제 해결

| 증상 | 확인할 것 |
| --- | --- |
| `조회 오류` + `PGRST205` / `relation does not exist` | `supabase/setup.sql`을 올바른 프로젝트에서 실행했는지 |
| `permission denied` / `42501` | RLS 조회 정책 `lab_public_read_only`가 있는지 |
| 계속 `DEMO DATA` | `.env.local` 두 값을 모두 넣었는지, 개발 서버를 재시작했는지. Vercel은 등록 후 Redeploy |
| `Failed to fetch` | URL 오타, 네트워크·방화벽 |
| 판정 칸이 `!`로 보임 | `verdict` 값이 5단계 이름과 정확히 같은지 (띄어쓰기 포함) |

DB 조회가 실패하면 가상 데이터를 대신 보여 주지 않고 **오류를 그대로 표시**합니다.

---

### 사용 기술
- Vite 7, 순수 JavaScript, `@supabase/supabase-js` 2
- Supabase PostgreSQL (익명 조회 전용 RLS)
- Vercel (GitHub `main` 브랜치 push 시 자동 배포)
