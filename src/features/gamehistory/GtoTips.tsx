import { useState } from "react";
import type { ReactNode } from "react";

/**
 * 卡片底部的通用说明区：频率条含义 + 近似 / 简化说明。
 * 这些内容与每一手牌无关，因此始终默认折叠，用户可点击展开。
 */
export default function GtoTips({
  hint,
  limitations,
}: {
  hint?: ReactNode;
  limitations?: string[];
}) {
  const [open, setOpen] = useState(false);
  const hasContent = !!hint || (limitations && limitations.length > 0);
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
