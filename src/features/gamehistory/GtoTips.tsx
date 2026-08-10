import { useState } from "react";
import type { ReactNode } from "react";

/**
 * 卡片中出现的核心名词，与具体手牌无关，随通用说明一起默认折叠。
 */
const GLOSSARY: { term: string; desc: string }[] = [
  {
    term: "bb",
    desc: "大盲注（big blind），一局的最小下注单位；筹码量常用 bb 计量，如 60bb 表示 60 个大盲注的筹码。",
  },
  {
    term: "底池",
    desc: "当前牌局中所有玩家已投入的筹码总和，下注尺度常按底池百分比计算。",
  },
  {
    term: "筹码",
    desc: "牌局中的记分单位，一手牌的结果（赢 / 输）都以筹码计算。",
  },
  {
    term: "有效筹码",
    desc: "牌局中筹码最少的那位玩家的筹码量，决定双方最多能往底池里投入多少。",
  },
  {
    term: "位置（IP / OOP）",
    desc: "行动顺序。IP 后行动、有信息优势；OOP 先行动、通常更适合过牌控池。",
  },
  {
    term: "翻牌 / 转牌 / 河牌",
    desc: "翻牌翻开前三张公共牌，转牌为第四张，河牌为第五张。",
  },
  {
    term: "下注 / 过牌 / 跟注 / 加注 / 全下 / 弃牌",
    desc: "六种行动：无人下注时主动投入为下注；把行动权让给下一位为过牌；匹配下注为跟注；提高下注额为加注；投入全部剩余筹码为全下；放弃手牌为弃牌。",
  },
  {
    term: "60% 底池",
    desc: "下注额占底池的比例，即 0.6 × 底池。例如底池 45 时下注 27（≈60%）。",
  },
  {
    term: "频率",
    desc: "GTO 混合策略中采取某个动作的概率，如本牌面下注 60%、过牌 40%。",
  },
  {
    term: "推荐频率",
    desc: "对你这手牌推荐动作的选用概率（区别于整个范围的行动分布）。",
  },
  {
    term: "混合策略",
    desc: "均衡策略下同一手牌按概率采取不同行动，让对手无法用固定应对获利。",
  },
  {
    term: "权益",
    desc: "胜率，即当前手牌摊牌时赢下底池的期望概率。",
  },
  {
    term: "继续范围",
    desc: "对手面对下注不会弃牌（选择跟注或加注）的那部分底牌范围。",
  },
  {
    term: "对继续范围权益",
    desc: "你的手牌对继续范围的胜率，如 50% 表示被跟注时约五五开。",
  },
  {
    term: "对随机权益",
    desc: "对手拿任意随机两张牌时你的胜率。",
  },
  {
    term: "组合",
    desc: "某种牌在牌面约束下可能的底牌种数（如 AA 有 6 种）。118 组合指继续范围共含 118 种具体底牌。",
  },
  {
    term: "手牌类别",
    desc: "按牌力分级：高牌、一对、两对、三条、顺子、同花、葫芦、四条、同花顺。",
  },
  {
    term: "牌面",
    desc: "公共牌组合及其特征（干燥 / 湿润、成对、同花面等），影响下注倾向。",
  },
  {
    term: "组合加权",
    desc: "频率按范围内每种手牌组合的数量加权计算，而非每手牌等权平均。",
  },
  {
    term: "GTO",
    desc: "博弈论最优（Game Theory Optimal），一种不可被对手利用的均衡策略。",
  },
];

/**
 * 卡片底部的通用说明区：频率条含义、实际偏移、名词与近似说明。
 * 整个区域始终默认折叠，用户可点击展开。
 */
export default function GtoTips({
  hint,
  adjustments,
  limitations,
}: {
  hint?: ReactNode;
  adjustments?: string[];
  limitations?: string[];
}) {
  const [open, setOpen] = useState(false);
  const hasContent =
    !!hint ||
    (adjustments && adjustments.length > 0) ||
    (limitations && limitations.length > 0);
  if (!hasContent) return null;

  return (
    <div className="gto-advice-card__tips">
      <button
        type="button"
        className="gto-advice-card__tips-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>通用说明</span>
        <span className="gto-advice-card__tips-arrow">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="gto-advice-card__tips-body">
          {hint && <div className="gto-advice-card__hint">{hint}</div>}
          {adjustments && adjustments.length > 0 && (
            <div className="gto-advice-card__insight">
              <div className="gto-advice-card__insight-group">
                <div className="gto-advice-card__insight-title">
                  实际情况偏移建议
                </div>
                {adjustments.map((note, i) => (
                  <small key={`adj-${i}`}>· {note}</small>
                ))}
              </div>
            </div>
          )}
          <div className="gto-advice-card__insight">
            <div className="gto-advice-card__insight-group">
              <div className="gto-advice-card__insight-title">
                名词解释
              </div>
              <dl className="gto-advice-card__glossary">
                {GLOSSARY.map((item) => (
                  <div className="gto-advice-card__glossary-item" key={item.term}>
                    <dt>{item.term}</dt>
                    <dd>{item.desc}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          {limitations && limitations.length > 0 && (
            <div className="gto-advice-card__insight">
              <div className="gto-advice-card__insight-group">
                <div className="gto-advice-card__insight-title">
                  近似 / 简化说明
                </div>
                {limitations.map((note, i) => (
                  <small key={`lim-${i}`}>· {note}</small>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
