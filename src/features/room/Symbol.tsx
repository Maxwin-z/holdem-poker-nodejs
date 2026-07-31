export function SmallBlind() {
  return (
    <span
      className="live-position-badge live-position-badge--sb"
      aria-label="小盲位"
      title="小盲位"
    >
      SB
    </span>
  );
}

export function BigBlind() {
  return (
    <span
      className="live-position-badge live-position-badge--bb"
      aria-label="大盲位"
      title="大盲位"
    >
      BB
    </span>
  );
}

export function Dealer() {
  return (
    <span
      className="live-position-badge live-position-badge--dealer"
      aria-label="庄家位"
      title="庄家位"
    >
      D
    </span>
  );
}

export function AllIn() {
  return <img src={require("../../assets/allin.png")} alt="All-in" />;
}
