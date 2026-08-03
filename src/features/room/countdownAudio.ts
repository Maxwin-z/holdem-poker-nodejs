const countdownSound = require("../../assets/countdown-tick-tock.wav");

let countdownAudio: HTMLAudioElement | null = null;
let countdownAudioOwner: object | null = null;

function getCountdownAudio() {
  if (!countdownAudio && typeof Audio !== "undefined") {
    countdownAudio = new Audio(countdownSound);
    countdownAudio.preload = "auto";
  }
  return countdownAudio;
}

export function playCountdownAudio(owner: object) {
  const audio = getCountdownAudio();
  if (!audio) return;

  if (countdownAudioOwner === owner && !audio.paused) {
    return;
  }

  audio.pause();
  audio.currentTime = 0;
  countdownAudioOwner = owner;

  try {
    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch(() => {});
    }
  } catch (ignore) {}
}

export function stopCountdownAudio(owner: object) {
  if (countdownAudioOwner !== owner) {
    return;
  }

  countdownAudioOwner = null;
  if (countdownAudio) {
    countdownAudio.pause();
    countdownAudio.currentTime = 0;
  }
}

