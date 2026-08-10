import {
  CaretRightOutlined,
  CheckOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Switch, Tooltip } from "antd";
import { useEffect, useRef, useState } from "react";
import { useAppSelector } from "../../app/hooks";
import {
  ws_overtime,
  ws_runItOut,
  ws_startGame,
  ws_userBet,
  ws_userFold,
  ws_userReady,
} from "../../app/websocket";
import { CountDown } from "./CountDown";
import { Poker } from "./Poker";
import { BigBlind, Dealer, SmallBlind } from "./Symbol";
import { selectGame, selectRoom, selectSelf } from "./roomSlice";
import { calculateOvertimeCost } from "../../shared/overtime";
import { isAiPracticeTable } from "../../shared/actionTimer";
import { BuyInSettingButton } from "./BuyInSetting";
import { canRunItOut as getCanRunItOut } from "./runItOut";
const hintsound = require("../../assets/hint.wav");
const dealcardsound = require("../../assets/dealcard.wav");

function formatChips(value: number) {
  return value.toLocaleString("en-US");
}

export function Owner() {
  const hintSoundRef = useRef<HTMLAudioElement>(null);
  const dealCardSoundRef = useRef<HTMLAudioElement>(null);
  const raiseInputRef = useRef<HTMLInputElement>(null);

  const self = useAppSelector(selectSelf);
  const game = useAppSelector(selectGame);
  const room = useAppSelector(selectRoom);

  const selfAsUser = room?.users.find((user) => user.id === self?.id);

  const preBet = game?.preBet || 0;
  const raiseBet = game?.raiseBet || 0;
  const raiseBetDiff = game?.raiseBetDiff || 0;
  const pots = game?.pots || 0;
  const bb = game?.bb || 0;
  const isSettling = game?.isSettling || false;

  const name = self?.name || "";
  const stack = self?.stack || 0;
  const bet = self?.bet || 0;
  const isActing = self?.isActing || false;
  const isWaiting =
    !isSettling &&
    !self?.isActing &&
    !self?.isAllIn &&
    !self?.isFoled &&
    self?.isInCurrentGame;
  const actionEndTime = self?.actionEndTime || Date.now();
  const leftTime = actionEndTime - Date.now();
  const position = self?.position;

  const canCheck = bet == preBet;
  const canCall = preBet > bet && stack + bet > preBet;
  const canRaise = game?.raiseUser != self?.id;
  const shouldAllIn = stack + bet <= preBet;
  const onlyRaiseAllIn = stack + bet <= raiseBet + raiseBetDiff;
  const minRaise = Math.min(stack, Math.max(bb, raiseBet + raiseBetDiff - bet));
  const maxRaise = stack;
  const has1_4 = stack >= pots / 4 && pots / 4 >= minRaise;
  const has1_3 = stack >= pots / 3 && pots / 3 >= minRaise;
  const has1_2 = stack >= pots / 2 && pots / 2 >= minRaise;
  const has2_3 = stack >= (pots * 2) / 3 && (pots * 2) / 3 >= minRaise;
  const has3_4 = stack >= (pots * 3) / 4 && (pots * 3) / 4 >= minRaise;
  const has1_1 = stack >= pots && pots >= minRaise;
  const useBB = stack > 4 * bb && pots < 4 * bb;

  const chips2call = Math.min(stack, preBet - bet);
  const inGame = self?.isInCurrentGame && self?.isReady && !self?.isFoled;
  const showSelfHands = Boolean(
    self?.isReady || (self?.isInCurrentGame && !isSettling)
  );
  const actionText =
    self && !self.isReady
      ? "休息"
      : self?.actionName || (isActing ? "轮到你" : "等待");
  // Solo AI practice already grants 3 minutes per action, so overtime is off.
  const isAiPractice = isAiPracticeTable(room?.users || []);
  const overtimeCost = isAiPractice
    ? 0
    : calculateOvertimeCost({
        bigBlind: bb,
        pots,
        playerCount: game?.userCount || 0,
        availableStack: stack,
      });

  const [raiseInput, setRaiseInput] = useState("");
  const [now, setNow] = useState(0);
  const [autoCheck, setAutoCheck] = useState(false);
  const [showAllInConfirm, setShowAllInConfirm] = useState(false);
  const [showFoldConfirm, setShowFoldConfirm] = useState(false);

  const raise = Number(raiseInput);
  const hasValidRaise =
    raiseInput !== "" &&
    Number.isFinite(raise) &&
    Number.isInteger(raise) &&
    raise >= minRaise;

  const setRaiseAmount = (amount: number) => {
    setRaiseInput(String(amount));
  };

  const focusRaiseInput = () => {
    window.setTimeout(() => raiseInputRef.current?.focus(), 0);
  };

  const handleRaise = () => {
    if (!isActing || !canRaise) return;

    if (onlyRaiseAllIn) {
      ws_userBet(stack + bet);
      return;
    }

    if (!hasValidRaise) {
      focusRaiseInput();
      return;
    }

    if (raise > stack) {
      setShowAllInConfirm(true);
      return;
    }

    ws_userBet(raise + bet);
  };

  const handleFold = () => {
    if (!isActing) return;
    if (canCheck) {
      setShowFoldConfirm(true);
      return;
    }
    ws_userFold();
  };

  useEffect(() => {
    if (hintSoundRef.current && isActing) {
      const audio: HTMLAudioElement = hintSoundRef.current;
      try {
        audio.play();
      } catch (ignore) {}
    }

    if (autoCheck && isActing) {
      if (canCheck) {
        ws_userBet(bet);
      } else {
        ws_userFold();
      }
    }
  }, [isActing]);

  useEffect(() => {
    setRaiseInput("");
    setAutoCheck(false);
  }, [game?.boardCards.length, game?.isSettling]);

  useEffect(() => {
    if (!isActing) {
      setShowAllInConfirm(false);
      setShowFoldConfirm(false);
    }
  }, [isActing]);

  useEffect(() => {
    if (dealCardSoundRef.current && room?.isGaming) {
      const audio: HTMLAudioElement = dealCardSoundRef.current;
      audio.play();
    }
  }, [game?.boardCards.length, room?.isGaming]);

  const positionComponent =
    position === "SB" ? (
      <SmallBlind />
    ) : position === "BB" ? (
      <BigBlind />
    ) : position === "D" ? (
      <Dealer />
    ) : null;

  const showRaiseControls =
    isActing && canRaise && !onlyRaiseAllIn && !shouldAllIn;
  const canStartGame = Boolean(self?.isRoomOwner && !room?.isGaming);
  const canReady = Boolean(self && !self.isSpectator && !self.isReady);
  const canRunItOut = getCanRunItOut({
    isSettling,
    publicCardCount: game?.boardCards.length || 0,
    isInCurrentGame: Boolean(self?.isInCurrentGame),
    isSpectator: Boolean(self?.isSpectator),
    privateCardCount: self?.runItOutBoardCards?.length || 0,
  });
  const idleTitle = canReady
    ? room?.isGaming
      ? "准备加入下一手"
      : "准备加入牌局"
    : !room?.isGaming
    ? self?.isRoomOwner
      ? "牌桌等待开局"
      : "等待房主开始游戏"
    : isSettling
    ? "本手正在结算"
    : self?.isSpectator
    ? "当前为观战模式"
    : self?.isFoled
    ? "本手已弃牌"
    : "等待下一手开始";
  const idleDescription = canReady
    ? room?.isGaming
      ? "准备后将在下一手自动入座"
      : "点击准备，告诉房主你已就绪"
    : canStartGame
    ? "至少两名玩家准备后即可开始"
    : canRunItOut
    ? "查看原牌堆剩余公共牌；筹码足够时向其他本手玩家各支付 1BB"
    : "操作区会在需要行动时自动更新";
  const sliderValue = Math.min(
    maxRaise,
    Math.max(minRaise, hasValidRaise ? raise : minRaise)
  );

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        showAllInConfirm ||
        showFoldConfirm
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isRaiseInput = target === raiseInputRef.current;
      const isEditable = Boolean(
        target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable)
      );
      const key = event.key.toLowerCase();

      // Inside the chip input, regular typing remains native; R is the one
      // explicit submit shortcut requested for that field.
      if (isRaiseInput) {
        if (key === "r" && hasValidRaise) {
          event.preventDefault();
          handleRaise();
        }
        return;
      }

      // Never turn chat, buy-in, or other editable-field keystrokes into game
      // actions. This also keeps IME composition isolated from shortcuts.
      if (isEditable || event.isComposing) return;

      if (/^[0-9]$/.test(event.key) && showRaiseControls) {
        event.preventDefault();
        setRaiseInput(event.key);
        raiseInputRef.current?.focus();
        return;
      }

      switch (key) {
        case "i":
          if (isWaiting) {
            event.preventDefault();
            setAutoCheck((enabled) => !enabled);
          }
          break;
        case "k":
          if (isActing && canCheck) {
            event.preventDefault();
            ws_userBet(bet);
          }
          break;
        case "c":
          if (isActing && preBet > bet) {
            event.preventDefault();
            ws_userBet(chips2call + bet);
          }
          break;
        case "f":
          if (isActing) {
            event.preventDefault();
            handleFold();
          }
          break;
        case "r":
          if (isActing && canRaise && !shouldAllIn) {
            event.preventDefault();
            handleRaise();
          }
          break;
        case "m":
          if (isActing && overtimeCost > 0) {
            event.preventDefault();
            ws_overtime();
            setNow((value) => value + 1);
          }
          break;
        case "s":
          if (canRunItOut) {
            event.preventDefault();
            ws_runItOut();
          }
          break;
      }
    };

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  });

  return (
    <div className="live-owner-dock">
      <audio src={hintsound} autoPlay={false} ref={hintSoundRef} />
      <audio src={dealcardsound} autoPlay={false} ref={dealCardSoundRef} />

      <div className={`live-owner-row ${!inGame ? "is-folded" : ""}`}>
        {self?.isWinner && self.profits >= 0 ? (
          <div className="live-owner-winner-tip" role="status">
            <small>WIN</small>
            <span>{self.handsType || "本手胜出"}</span>
            <strong>+{formatChips(self.profits)}</strong>
          </div>
        ) : null}

        <div className="live-owner-cards">
          <Poker
            card={showSelfHands ? self?.hands[0] || null : null}
            index={0}
            showHand={showSelfHands && isSettling && !selfAsUser?.hands[0]}
          />
          <Poker
            card={showSelfHands ? self?.hands[1] || null : null}
            index={1}
            showHand={showSelfHands && isSettling && !selfAsUser?.hands[1]}
          />
        </div>

        <div className="live-owner-profile-slot">
          {position ? (
            <span className="live-owner-position" title={position}>
              {positionComponent}
            </span>
          ) : null}
          <div
            className={[
              "live-owner-profile",
              stack >= 100000 ? "has-large-stack" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="live-owner-avatar-wrap">
              <Avatar className="live-owner-avatar">YOU</Avatar>
              {isActing ? (
                <Tooltip
                  title={
                    overtimeCost > 0
                      ? `快捷键 M · 点击加时，需支付其他玩家各 ${formatChips(
                          overtimeCost
                        )} 筹码`
                      : isAiPractice
                      ? "AI 练习模式，每次行动有 3 分钟思考时间"
                      : "剩余筹码不足，无法购买加时"
                  }
                >
                  <button
                    type="button"
                    className="live-owner-avatar-timer"
                    aria-label="行动倒计时与加时"
                    aria-keyshortcuts="M"
                    disabled={overtimeCost <= 0}
                    onClick={() => {
                      ws_overtime();
                      setNow(now + 1);
                    }}
                  >
                    <CountDown
                      time={Math.max(0, Math.ceil(leftTime / 1000))}
                      total={self?.actionTimeLimit}
                      now={now}
                      variant="ring"
                      playUrgentSound
                    />
                  </button>
                </Tooltip>
              ) : null}
            </div>
            <div className="live-owner-copy">
              <div>
                <strong>{name}</strong>
              </div>
              <b>{formatChips(stack)}</b>
            </div>
          </div>
        </div>

        <div className="live-owner-bet">
          <span>{actionText}</span>
          {bet > 0 ? (
            <>
              {/* key 随金额变化重挂载,重放入场动画 */}
              <i className="live-chip-disc" key={bet} aria-hidden="true" />
              <b>+{formatChips(bet)}</b>
            </>
          ) : null}
          {self?.handsType ? <em>{self.handsType}</em> : null}
        </div>
      </div>

      <section
        className={`live-action-panel ${
          isActing ? "is-acting" : "is-waiting"
        }`}
      >
        <div className="live-action-panel__handle" />

        {isActing ? (
          <>
            {showRaiseControls ? (
              <div className="live-raise-controls">
                <div className="live-raise-slider-row">
                  <input
                    type="range"
                    min={minRaise}
                    max={maxRaise}
                    value={sliderValue}
                    onChange={(event) =>
                      setRaiseAmount(Number(event.target.value))
                    }
                    aria-label="加注筹码"
                  />
                  <label>
                    <span>¥</span>
                    <input
                      ref={raiseInputRef}
                      type="number"
                      inputMode="numeric"
                      step={1}
                      value={raiseInput}
                      onChange={(event) => setRaiseInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          !event.nativeEvent.isComposing &&
                          hasValidRaise
                        ) {
                          event.preventDefault();
                          handleRaise();
                        }
                      }}
                      aria-label="加注金额"
                    />
                  </label>
                </div>

                <div className="live-raise-presets">
                  {useBB ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setRaiseAmount(bb * 2)}
                      >
                        <span>2BB</span>
                        <b>{formatChips(bb * 2)}</b>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRaiseAmount(Math.floor(bb * 2.5))}
                      >
                        <span>2.5BB</span>
                        <b>{formatChips(Math.floor(bb * 2.5))}</b>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRaiseAmount(bb * 3)}
                      >
                        <span>3BB</span>
                        <b>{formatChips(bb * 3)}</b>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRaiseAmount(bb * 4)}
                      >
                        <span>4BB</span>
                        <b>{formatChips(bb * 4)}</b>
                      </button>
                    </>
                  ) : (
                    <>
                      {has1_4 ? (
                        <button
                          type="button"
                          onClick={() => setRaiseAmount(Math.ceil(pots / 4))}
                        >
                          <span>¼ 池</span>
                          <b>{formatChips(Math.ceil(pots / 4))}</b>
                        </button>
                      ) : null}
                      {has1_3 ? (
                        <button
                          type="button"
                          onClick={() => setRaiseAmount(Math.ceil(pots / 3))}
                        >
                          <span>⅓ 池</span>
                          <b>{formatChips(Math.ceil(pots / 3))}</b>
                        </button>
                      ) : null}
                      {has1_2 ? (
                        <button
                          type="button"
                          onClick={() => setRaiseAmount(Math.ceil(pots / 2))}
                        >
                          <span>½ 池</span>
                          <b>{formatChips(Math.ceil(pots / 2))}</b>
                        </button>
                      ) : null}
                      {has2_3 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setRaiseAmount(Math.ceil((pots * 2) / 3))
                          }
                        >
                          <span>⅔ 池</span>
                          <b>{formatChips(Math.ceil((pots * 2) / 3))}</b>
                        </button>
                      ) : null}
                      {has3_4 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setRaiseAmount(Math.ceil((pots * 3) / 4))
                          }
                        >
                          <span>¾ 池</span>
                          <b>{formatChips(Math.ceil((pots * 3) / 4))}</b>
                        </button>
                      ) : null}
                      {has1_1 ? (
                        <button
                          type="button"
                          onClick={() => setRaiseAmount(Math.ceil(pots))}
                        >
                          <span>底池</span>
                          <b>{formatChips(Math.ceil(pots))}</b>
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ) : null}

            <div className="live-action-buttons">
              <button
                type="button"
                className="is-fold"
                aria-keyshortcuts="F"
                onClick={handleFold}
              >
                <strong>弃牌</strong>
                <span>F · FOLD</span>
              </button>
              {canCheck ? (
                <button
                  type="button"
                  className="is-call"
                  aria-keyshortcuts="K"
                  onClick={() => ws_userBet(bet)}
                >
                  <strong>过牌</strong>
                  <span>K · CHECK</span>
                </button>
              ) : null}
              {canCall ? (
                <button
                  type="button"
                  className="is-call"
                  aria-keyshortcuts="C"
                  onClick={() => ws_userBet(chips2call + bet)}
                >
                  <strong>跟注 {formatChips(chips2call)}</strong>
                  <span>C · CALL</span>
                </button>
              ) : null}
              {shouldAllIn ? (
                <button
                  type="button"
                  className="is-raise"
                  aria-keyshortcuts="C"
                  onClick={() => ws_userBet(chips2call + bet)}
                >
                  <strong>All-in {formatChips(chips2call)}</strong>
                  <span>C · ALL IN</span>
                </button>
              ) : canRaise ? (
                onlyRaiseAllIn ? (
                  <button
                    type="button"
                    className="is-raise"
                    aria-keyshortcuts="R"
                    onClick={() => ws_userBet(minRaise + bet)}
                  >
                    <strong>All-in {formatChips(minRaise)}</strong>
                    <span>R · ALL IN</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="is-raise"
                    aria-keyshortcuts="R"
                    disabled={!hasValidRaise}
                    onClick={handleRaise}
                  >
                    <strong>加注 {formatChips(raise)}</strong>
                    <span>R · RAISE</span>
                  </button>
                )
              ) : null}
            </div>
          </>
        ) : isWaiting ? (
          <div className="live-preaction">
            <div className="live-preaction__heading">
              <div>
                <small>当前行动</small>
                <strong>
                  {room?.users.find((user) => user.isActing)?.name
                    ? `等待 ${
                        room?.users.find((user) => user.isActing)?.name
                      } 做决定`
                    : "等待其他玩家行动"}
                </strong>
              </div>
              <span className="live-preaction__indicator" />
            </div>
            <div className="live-preaction__body">
              <div>
                <strong>提前选择</strong>
                <span>轮到你时自动执行，也可再次点击取消</span>
              </div>
              <div
                className={`live-preaction__choice ${
                  autoCheck ? "is-selected" : ""
                }`}
              >
                <Switch
                  checked={autoCheck}
                  onChange={(checked) => setAutoCheck(checked)}
                  aria-keyshortcuts="I"
                />
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => setAutoCheck(!autoCheck)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      setAutoCheck(!autoCheck);
                    }
                  }}
                >
                  <strong>自动过牌 / 弃牌</strong>
                  <small>I · CHECK / FOLD</small>
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="live-action-idle">
            <span className="live-preaction__indicator" />
            <div>
              <strong>{idleTitle}</strong>
              <span>{idleDescription}</span>
            </div>
            {canReady || canStartGame || canRunItOut ? (
              <div className="live-action-idle__actions">
                {canRunItOut ? (
                  <Button
                    type="primary"
                    size="large"
                    icon={<EyeOutlined />}
                    aria-keyshortcuts="S"
                    onClick={ws_runItOut}
                  >
                    <span>发发看</span>
                    <kbd aria-hidden="true">S</kbd>
                  </Button>
                ) : null}
                {canReady ? (
                  <>
                    <Button
                      type="primary"
                      size="large"
                      icon={<CheckOutlined />}
                      onClick={ws_userReady}
                    >
                      {room?.isGaming ? "准备下一手" : "准备加入"}
                    </Button>
                    <BuyInSettingButton
                      className="live-action-idle__secondary"
                      size="large"
                    />
                  </>
                ) : null}
                {canStartGame ? (
                  <Button
                    type="primary"
                    size="large"
                    icon={<CaretRightOutlined />}
                    onClick={ws_startGame}
                  >
                    开始游戏
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </section>

      {showAllInConfirm ? (
        <div className="live-action-confirm-backdrop">
          <div
            className="live-action-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="live-all-in-confirm-title"
          >
            <small>ALL-IN</small>
            <strong id="live-all-in-confirm-title">输入金额超过当前 Stack</strong>
            <p>
              当前最多可投入 {formatChips(stack)} 筹码，是否改为 All-in？
            </p>
            <div>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setShowAllInConfirm(false);
                  focusRaiseInput();
                }}
              >
                取消，返回修改
              </button>
              <button
                type="button"
                className="is-primary"
                onClick={() => {
                  setShowAllInConfirm(false);
                  ws_userBet(stack + bet);
                }}
              >
                确认 All-in
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showFoldConfirm ? (
        <div className="live-action-confirm-backdrop">
          <div
            className="live-action-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="live-fold-confirm-title"
          >
            <small>CHECK AVAILABLE</small>
            <strong id="live-fold-confirm-title">当前可以免费过牌</strong>
            <p>你仍然要弃牌，还是改为过牌？</p>
            <div>
              <button
                type="button"
                className="is-danger"
                onClick={() => {
                  setShowFoldConfirm(false);
                  ws_userFold();
                }}
              >
                坚持弃牌
              </button>
              <button
                type="button"
                className="is-primary"
                autoFocus
                onClick={() => {
                  setShowFoldConfirm(false);
                  ws_userBet(bet);
                }}
              >
                过牌
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
