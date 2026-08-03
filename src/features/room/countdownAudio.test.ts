import {
  playCountdownAudio,
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
  const audio = {
    currentTime: 0,
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
  const firstOwner = {};
  const secondOwner = {};

  playCountdownAudio(firstOwner);
  playCountdownAudio(secondOwner);

  expect(AudioMock).toHaveBeenCalledTimes(1);
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

  expect(play).toHaveBeenCalledTimes(2);
  stopCountdownAudio(blockedOwner);
});
