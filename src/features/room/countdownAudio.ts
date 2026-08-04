const countdownSound = require("../../assets/countdown-tick-tock.m4a");

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
let countdownAudioPreloaded = false;

function getCountdownAudio() {
  if (!countdownAudio && typeof Audio !== "undefined") {
    countdownAudio = new Audio(countdownSound);
    countdownAudio.preload = "auto";
  }
  return countdownAudio;
}

export function preloadCountdownAudio() {
  const audio = getCountdownAudio();
  if (!audio || countdownAudioPreloaded) return;

  countdownAudioPreloaded = true;
  try {
    audio.load();
  } catch (ignore) {}
}

async function startCountdownAudio(audio: HTMLAudioElement) {
  try {
    const playPromise = audio.play();
    if (playPromise) {
      await playPromise;
    }
    return true;
  } catch (ignore) {
    return false;
  }
}

function canUseLocalAudio(owner: object, request: number) {
  const isVisible =
    typeof document === "undefined" || document.visibilityState === "visible";
  return (
    isVisible &&
    countdownAudioOwner === owner &&
    countdownAudioRequest === request
  );
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

  const playWithoutLockIfVisible = () => {
    if (canUseLocalAudio(owner, request)) {
      startCountdownAudio(audio);
    }
  };

  lockManager
    .request(
      "holdem-poker-countdown-audio",
      { ifAvailable: true },
      async (lock) => {
        if (!lock) {
          playWithoutLockIfVisible();
          return;
        }

        if (
          countdownAudioOwner !== owner ||
          countdownAudioRequest !== request
        ) {
          return;
        }

        const didStart = await startCountdownAudio(audio);
        if (!didStart) {
          return;
        }

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
    .catch(playWithoutLockIfVisible);
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
