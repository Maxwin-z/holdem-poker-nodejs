import {
  playCountdownAudio,
  preloadCountdownAudio,
  stopCountdownAudio,
} from "./countdownAudio";

test("uses one audio player across consecutive countdown owners", async () => {
  let paused = true;
  const pause = jest.fn(() => {
    paused = true;
  });
  const play = jest.fn(() => {
    paused = false;
    return Promise.resolve();
  });
  const load = jest.fn();
  const audio = {
    currentTime: 0,
    load,
    pause,
    play,
    preload: "",
    get paused() {
      return paused;
    },
  } as unknown as HTMLAudioElement;
  const AudioMock = jest.fn(() => audio);
  Object.defineProperty(window, "Audio", {
    configurable: true,
    value: AudioMock,
  });
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  const firstOwner = {};
  const secondOwner = {};

  preloadCountdownAudio();
  preloadCountdownAudio();
  playCountdownAudio(firstOwner);
  playCountdownAudio(secondOwner);

  expect(AudioMock).toHaveBeenCalledTimes(1);
  expect(load).toHaveBeenCalledTimes(1);
  expect(play).toHaveBeenCalledTimes(2);
  expect(pause).toHaveBeenCalledTimes(2);

  stopCountdownAudio(firstOwner);
  expect(pause).toHaveBeenCalledTimes(2);

  stopCountdownAudio(secondOwner);
  expect(pause).toHaveBeenCalledTimes(3);
  expect(audio.currentTime).toBe(0);

  const blockedOwner = {};
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: jest.fn(
        async (
          _name: string,
          _options: { ifAvailable: boolean },
          callback: (lock: object | null) => Promise<void>
        ) => callback(null)
      ),
    },
  });

  playCountdownAudio(blockedOwner);
  await Promise.resolve();

  expect(play).toHaveBeenCalledTimes(3);
  stopCountdownAudio(blockedOwner);

  const rejectedOwner = {};
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: jest.fn(() => Promise.reject(new Error("locks unavailable"))),
    },
  });

  playCountdownAudio(rejectedOwner);
  await Promise.resolve();
  await Promise.resolve();

  expect(play).toHaveBeenCalledTimes(4);
  stopCountdownAudio(rejectedOwner);

  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "hidden",
  });
  const hiddenOwner = {};
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: jest.fn(
        async (
          _name: string,
          _options: { ifAvailable: boolean },
          callback: (lock: object | null) => Promise<void>
        ) => callback(null)
      ),
    },
  });

  playCountdownAudio(hiddenOwner);
  await Promise.resolve();

  expect(play).toHaveBeenCalledTimes(4);
  stopCountdownAudio(hiddenOwner);
});
