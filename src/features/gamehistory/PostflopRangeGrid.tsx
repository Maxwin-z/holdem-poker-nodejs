/**
 * 13x13 二维表：展示翻后“继续范围”的具体组合明细。
 * 与翻前牌力表同构（行/列 = 牌面大小），绿色深浅表示该手牌类别
 * 在继续范围中的组合数占比。
 */

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

const MAX_COMBOS_BY_TYPE: Record<"pair" | "suited" | "offsuit", number> = {
  pair: 6,
  suited: 4,
  offsuit: 12,
};

function handType(key: string): "pair" | "suited" | "offsuit" {
  if (key.length === 2) return "pair";
  return key[2] === "s" ? "suited" : "offsuit";
}

export function gridCellForHand(handKey: string): { r: number; c: number } {
  return { r: RANKS.indexOf(handKey[0]), c: RANKS.indexOf(handKey[1]) };
}

export default function PostflopRangeGrid({
  combos,
  heroHandKey,
}: {
  combos: string[];
  heroHandKey?: string;
}) {
  const counts = new Map<string, number>();
  for (const key of combos) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const heroPos = heroHandKey ? gridCellForHand(heroHandKey) : null;

  return (
    <div className="range-grid">
      <div className="range-grid__row range-grid__row--header">
        <span className="range-grid__rank" />
        {RANKS.map((rank) => (
          <span className="range-grid__rank" key={rank}>
            {rank}
          </span>
        ))}
      </div>
      {RANKS.map((rowRank, i) => (
        <div className="range-grid__row" key={rowRank}>
          <span className="range-grid__rank">{rowRank}</span>
          {RANKS.map((colRank, j) => {
            const handKey =
              i === j
                ? rowRank + colRank
                : i < j
                ? rowRank + colRank + "s"
                : colRank + rowRank + "o";
            const count = counts.get(handKey) ?? 0;
            const inRange = count > 0;
            const isHero = !!heroPos && heroPos.r === i && heroPos.c === j;
            const fill =
              inRange
                ? 0.45 +
                  0.55 * Math.min(1, count / MAX_COMBOS_BY_TYPE[handType(handKey)])
                : 1;
            return (
              <span
                key={colRank}
                className={`range-grid__cell ${
                  inRange ? "is-in-range" : "is-out"
                } ${isHero ? "is-hero" : ""}`}
                style={{
                  background: inRange
                    ? `rgba(34, 197, 94, ${fill.toFixed(2)})`
                    : "#2b3338",
                }}
                title={inRange ? `${handKey} × ${count} 组合` : handKey}
              >
                {handKey}
              </span>
            );
          })}
        </div>
      ))}
      <div className="range-grid__legend">
        <span className="range-grid__legend-item">
          <i style={{ background: "rgba(34, 197, 94, 0.9)" }} />
          继续范围（颜色越深组合越多）
        </span>
        <span className="range-grid__legend-item">
          <i style={{ background: "#2b3338" }} />
          不在范围
        </span>
        <span className="range-grid__legend-item">
          <i className="is-hero-dot" />
          你的手牌（黄框）
        </span>
      </div>
    </div>
  );
}
