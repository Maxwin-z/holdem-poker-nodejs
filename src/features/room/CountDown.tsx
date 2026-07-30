import { Progress } from "antd";
import { useEffect, useState } from "react";

export function CountDown({
  time,
  total = 60,
  now = 0,
  variant = "bar",
}: {
  time: number;
  total?: number;
  now?: number;
  variant?: "bar" | "ring";
}) {
  const [count, setCount] = useState(Math.max(0, time * 10));

  useEffect(() => {
    setCount(Math.max(0, time * 10));
  }, [time, now, total]);

  useEffect(() => {
    if (count <= 0) return;

    const timer = setTimeout(() => {
      setCount((current) => Math.max(0, current - 1));
    }, 100);

    return () => clearTimeout(timer);
  }, [count]);

  const percent = Math.max(
    0,
    Math.min(100, total > 0 ? (10 * count) / total : 0)
  );
  const seconds = Math.max(0, Math.ceil(count / 10));

  if (variant === "ring") {
    const strokeColor = seconds <= 5 ? "#ee7167" : "#2fd39b";
    return (
      <div
        className={`live-countdown-ring ${
          seconds <= 5 ? "is-urgent" : ""
        }`}
        aria-label={`剩余 ${seconds} 秒`}
      >
        <Progress
          type="circle"
          percent={percent}
          width={44}
          strokeWidth={8}
          strokeColor={strokeColor}
          trailColor="rgba(255, 255, 255, 0.16)"
          showInfo={false}
        />
        <span>{seconds}</span>
      </div>
    );
  }

  return (
    <Progress percent={percent} size="small" showInfo={false} />
  );
}
