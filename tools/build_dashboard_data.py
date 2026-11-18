"""월간 검토 JSON + 기준표 엑셀 -> 대시보드용 data.json

사용법:
  python tools/build_dashboard_data.py <review.json> <기준표.xlsx> <data.json> [--append]

- review.json: bim-monthly-review 스킬이 만든 검토 JSON
- --append: 기존 data.json에 실적월을 추가 (같은 실적월이 있으면 교체)
"""
import json
import os
import sys

from openpyxl import load_workbook

VERDICTS = ["이행", "미흡", "확인 필요", "해당 시기 아님"]


def load_criteria(path):
    ws = load_workbook(path, read_only=True)["기준표"]
    rows = list(ws.iter_rows(values_only=True))
    head = list(rows[0])
    return [dict(zip(head, r)) for r in rows[1:] if r[0]]


def cause(verdict, item, reason):
    """확인 필요의 원인 분류 (대시보드 집계용)."""
    if verdict != "확인 필요":
        return None
    if not item.get("검토주기"):
        return "기준 미확정"
    if "범위" in reason:
        return "과업 범위 확인"
    return "보고서에서 못 찾음"


def build_month(review, criteria):
    crit = {c["항목ID"]: c for c in criteria}
    groups = []
    for g in review["공구"]:
        verdicts = []
        for v in g["판정"]:
            c = crit[v["항목ID"]]
            verdicts.append({
                "id": v["항목ID"],
                "verdict": v["판정"],
                "evidence": v.get("근거", ""),
                "reason": v.get("이유", ""),
                "cause": cause(v["판정"], c, v.get("이유", "")),
            })
        r = g.get("결과물", {})
        req = r.get("보완요청") or {}
        groups.append({
            "name": g["공구"],
            "report": g.get("보고서", ""),
            "startDate": g.get("착수일", ""),
            "submitDate": g.get("제출일", ""),
            "warnings": g.get("경고", []),
            "verdicts": verdicts,
            "priority": r.get("우선과업", []),
            "request": {"title": req.get("제목", ""),
                        "items": [x for x in req.get("본문", []) if x.startswith("(T-")]},
            "memo": r.get("내부메모", []),
            # 진행 단계: 0 접수, 1 AI 초안, 2 판정 확정, 3 보완 요청 발송, 4 기성 의견 제출
            "stage": 1,
        })
    meta = review.get("meta", {})
    return {"month": meta["실적월"], "reviewDate": meta.get("검토일", ""),
            "note": meta.get("비고", ""), "groups": groups}


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 3:
        print(__doc__)
        sys.exit(2)
    review_path, crit_path, out = args
    with open(review_path, encoding="utf-8") as f:
        review = json.load(f)
    criteria = load_criteria(crit_path)
    month = build_month(review, criteria)

    data = {"months": []}
    if "--append" in sys.argv and os.path.exists(out):
        with open(out, encoding="utf-8") as f:
            data = json.load(f)
        data["months"] = [m for m in data["months"] if m["month"] != month["month"]]
    data["criteria"] = [{"id": c["항목ID"], "group": c.get("구분"), "name": c.get("과업항목"),
                         "cycle": c.get("검토주기") or "", "basis": c.get("근거")} for c in criteria]
    data["months"].append(month)
    data["months"].sort(key=lambda m: m["month"])
    data["isSample"] = "가상" in (month["note"] or "") or data.get("isSample", False)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    n = sum(len(g["verdicts"]) for g in month["groups"])
    print(f"저장: {out} ({month['month']}, 공구 {len(month['groups'])}개, 판정 {n}개)")


if __name__ == "__main__":
    main()
