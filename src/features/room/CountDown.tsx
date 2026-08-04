import { Progress } from "antd";
import { useEffect, useRef, useState } from "react";
import {
  INITIAL_ACTION_TIME_SECONDS,
  URGENT_ACTION_TIME_SECONDS,
} from "../../shared/actionTimer";
import {
  playCountdownAudio,
  preloadCountdownAudio,
  stopCountdownAudio,
} from "./countdownAudio";

export function CountDown({
  time,
  total = INITIAL_ACTION_TIME_SECONDS,
  now = 0,
  variant = "bar",
  playUrgentSound = false,
}: {
  time: number;
  total?: number;
  now?: number;
  variant?: "bar" | "ring";
  playUrgentSound?: boolean;
}) {
  const [count, setCount] = useState(Math.max(0, time * 10));
  const countdownAudioOwner = useRef<object>({});
  const seconds = Math.max(0, Math.ceil(count / 10));
  const shouldPlayUrgentSound =
    playUrgentSound &&
    seconds > 0 &&
    seconds <= URGENT_ACTION_TIME_SECONDS;

  useEffect(() => {
    setCount(Math.max(0, time * 10));
  }, [time, now, total]);

  useEffect(() => {
    if (playUrgentSound) {
      preloadCountdownAudio();
    }
  }, [playUrgentSound]);

  useEffect(() => {
    if (count <= 0) return;

    const timer = setTimeout(() => {
      setCount((current) => Math.max(0, current - 1));
    }, 100);

    return () => clearTimeout(timer);
  }, [count]);

  useEffect(() => {
    if (shouldPlayUrgentSound) {
      playCountdownAudio(countdownAudioOwner.current);
      return;
    }

    stopCountdownAudio(countdownAudioOwner.current);
  }, [shouldPlayUrgentSound]);

  useEffect(() => {
    const owner = countdownAudioOwner.current;
    return () => {
      stopCountdownAudio(owner);
    };
  }, []);

  const percent = Math.max(
    0,
    Math.min(100, total > 0 ? (10 * count) / total : 0)
  );
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

  return <Progress percent={percent} size="small" showInfo={false} />;
}
