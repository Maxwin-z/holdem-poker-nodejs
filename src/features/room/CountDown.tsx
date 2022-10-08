import { Progress } from "antd";
import { useEffect, useRef, useState } from "react";

type TimerType = ReturnType<typeof setTimeout> | null;

export function CountDown({
  time,
  total = 60,
  now = 0,
}: {
  time: number;
  total?: number;
  now?: number;
}) {
  const [count, setCount] = useState(time * 10);
  let t: TimerType;
  useEffect(() => {
    t && clearTimeout(t);
    setCount(time * 10);
  }, [time, now, total]);

  useEffect(() => {
    if (count > 0) {
      t = setTimeout(() => {
        setCount(count - 1);
      }, 100);
    }

    return () => {
      t && clearTimeout(t);
    };
  }, [count]);
  return (
    <Progress percent={(10 * count) / total} size="small" showInfo={false} />
  );
}
