const countdownSound = require("../../assets/countdown-tick-tock.wav");

type CountdownLockManager = {
  request(
    name: string,
    options: { ifAvailable: boolean },
    callback: (lock: object | null) => Promise<void>
  ): Promise<void>;
};

let countdownAudio: HTMLAudioElement | null = null;
let countdownAudioOwner: object | null = null;
let countdownAudioLockRelease: (() => void) | null = null;
let countdownAudioRequest = 0;

function getCountdownAudio() {
  if (!countdownAudio && typeof Audio !== "undefined") {
    countdownAudio = new Audio(countdownSound);
    countdownAudio.preload = "auto";
  }
  return countdownAudio;
}

function startCountdownAudio(audio: HTMLAudioElement) {
  try {
    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch(() => {});
    }
  } catch (ignore) {}
}

export function playCountdownAudio(owner: object) {
  const audio = getCountdownAudio();
  if (!audio) return;

  if (
    countdownAudioOwner === owner &&
    (!audio.paused || countdownAudioLockRelease)
  ) {
    return;
  }

  audio.pause();
  audio.currentTime = 0;
  countdownAudioLockRelease?.();
  countdownAudioLockRelease = null;
  countdownAudioOwner = owner;
  const request = ++countdownAudioRequest;
  const lockManager =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { locks?: CountdownLockManager }).locks
      : undefined;

  if (!lockManager) {
    startCountdownAudio(audio);
    return;
  }

  lockManager
    .request(
      "holdem-poker-countdown-audio",
      { ifAvailable: true },
      async (lock) => {
        if (
          !lock ||
          countdownAudioOwner !== owner ||
          countdownAudioRequest !== request
        ) {
          return;
        }

        startCountdownAudio(audio);
        let releaseLock = () => {};
        await new Promise<void>((resolve) => {
          releaseLock = resolve;
          countdownAudioLockRelease = releaseLock;
        });
        if (countdownAudioLockRelease === releaseLock) {
          countdownAudioLockRelease = null;
        }
      }
    )
    .catch(() => {});
}

export function stopCountdownAudio(owner: object) {
  if (countdownAudioOwner !== owner) {
    return;
  }

  countdownAudioOwner = null;
  countdownAudioRequest += 1;
  countdownAudioLockRelease?.();
  countdownAudioLockRelease = null;
  if (countdownAudio) {
    countdownAudio.pause();
    countdownAudio.currentTime = 0;
  }
}
