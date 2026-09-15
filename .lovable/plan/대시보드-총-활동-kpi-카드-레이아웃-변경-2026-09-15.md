# 대시보드 "총 활동" KPI 카드 레이아웃 변경

## 변경 대상
`src/routes/_authenticated/dashboard.tsx` 84~94번 줄의 첫 번째 KPI 카드.

## 현재 구조
- 제목: "총 활동"
- 큰 글씨: 전체 행 수 (`m.total`)
- 작은 글씨: "완료 X행 · Y%"
- 진도 막대

## 변경 후 구조
- 제목: "진도율"
- 큰 글씨: 완료 건수 (`m.done`) — `text-3xl font-bold`, `/schedule?status=done` 링크
- 큰 글씨 옆 약간 작은 글씨: 진도율% (`pct1(m.donePct)%`) — `text-lg font-semibold text-muted-foreground`
- 다음 줄 작은 글씨: 전체 행 수 — "전체 X행" (`text-[11px] text-muted-foreground`), `/schedule` 링크
- 진도 막대: 그대로 유지

## 구현
첫 번째 KPI 카드의 `<div>` 영역(85~94줄)을 아래와 같이 재구성:

```tsx
<div>
  <p className="text-xs font-bold text-muted-foreground">진도율</p>
  <p className="mt-1 flex flex-wrap items-baseline gap-1.5">
    <span className="text-3xl font-bold"><Drill to="/schedule" search={{ status: "done" }}>{m.done.toLocaleString()}</Drill></span>
    <span className="text-lg font-semibold text-muted-foreground">{pct1(m.donePct)}%</span>
  </p>
  <p className="mt-1 text-[11px] text-muted-foreground">
    전체 <Drill to="/schedule" className="font-semibold text-foreground">{m.total.toLocaleString()}</Drill>행
  </p>
  <Bar v={m.donePct} className="mt-3" />
</div>
```

## 검증
- `bun x tsgo --noEmit` 타입 검사 통과
