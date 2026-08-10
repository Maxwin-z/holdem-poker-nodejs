import type { AdviceTrust } from "../../gto/trust";
import {
  ADVICE_TRUST_DETAIL_CN,
  ADVICE_TRUST_LABEL_CN,
} from "../../gto/trust";

/**
 * Small badge showing how the advice was produced (chart / solved / model /
 * heuristic...), so learners can tell solver-grade guidance from
 * approximations. Renders nothing for legacy advice without a trust field.
 */
export default function TrustBadge({ trust }: { trust?: AdviceTrust }) {
  if (!trust) return null;
  return (
    <span
      className={`gto-advice-card__trust is-${trust}`}
      title={ADVICE_TRUST_DETAIL_CN[trust]}
    >
      {ADVICE_TRUST_LABEL_CN[trust]}
    </span>
  );
}
