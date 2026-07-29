import { Avatar, Button, Popover, Switch, Tooltip } from "antd";
import { useEffect, useRef, useState } from "react";
import { useAppSelector } from "../../app/hooks";
import {
  ws_overtime,
  ws_userBet,
  ws_userFold,
  ws_userRebuy,
} from "../../app/websocket";
import { CountDown } from "./CountDown";
import { Poker } from "./Poker";
import { BigBlind, Dealer, SmallBlind } from "./Symbol";
import { selectGame, selectRoom, selectSelf } from "./roomSlice";
import { card2html } from "../gamehistory/GameHistory";
const hintsound = require("../../assets/hint.wav");
const dealcardsound = require("../../assets/dealcard.wav");

function formatChips(value: number) {
  return value.toLocaleString("en-US");
}

export function Owner() {
  const hintSoundRef = useRef<HTMLAudioElement>(null);
  const dealCardSoundRef = useRef<HTMLAudioElement>(null);

  const self = useAppSelector(selectSelf);
  const game = useAppSelector(selectGame);
  const room = useAppSelector(selectRoom);

  const selfAsUser = room?.users.find((user) => user.id === self?.id);

  const preBet = game?.preBet || 0;
  const raiseBet = game?.raiseBet || 0;
  const raiseBetDiff = game?.raiseBetDiff || 0;
  const pots = game?.pots || 0;
  const bb = game?.bb || 0;
  const reBuyLimit = game?.reBuyLimit || 1;
  const isSettling = game?.isSettling || false;

  const name = self?.name || "";
  const stack = self?.stack || 0;
  const bet = self?.bet || 0;
  const isActing = self?.isActing || false;
  const isWaiting =
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
  const overtimeCost = Math.min(
    bb,
    Math.max(1, pots / 4 / (game?.userCount || 1)),
    stack / (game?.userCount || 1)
  );

  const [raise, setRaise] = useState(0);
  const [now, setNow] = useState(0);
  const [autoCheck, setAutoCheck] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(
    Math.max(0, Math.ceil(leftTime / 1000))
  );

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
    setRaise(0);
    setAutoCheck(false);
  }, [game?.boardCards.length, game?.isSettling]);

  useEffect(() => {
    if (dealCardSoundRef.current && room?.isGaming) {
      const audio: HTMLAudioElement = dealCardSoundRef.current;
      audio.play();
    }
  }, [game?.boardCards.length, room?.isGaming]);

  useEffect(() => {
    if (!isActing) return;
    const updateRemainingTime = () =>
      setRemainingSeconds(
        Math.max(0, Math.ceil((actionEndTime - Date.now()) / 1000))
      );
    updateRemainingTime();
    const timer = window.setInterval(updateRemainingTime, 250);
    return () => window.clearInterval(timer);
  }, [actionEndTime, isActing, now]);

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
  const sliderValue = Math.min(
    maxRaise,
    Math.max(minRaise, raise || minRaise)
  );

  return (
    <div className="live-owner-dock">
      <audio src={hintsound} autoPlay={false} ref={hintSoundRef} />
      <audio src={dealcardsound} autoPlay={false} ref={dealCardSoundRef} />

      <div className="live-owner-row">
        <div className="live-owner-cards">
          <Poker
            card={self?.hands[0] || null}
            index={0}
            showHand={isSettling && !selfAsUser?.hands[0]}
          />
          <Poker
            card={self?.hands[1] || null}
            index={1}
            showHand={isSettling && !selfAsUser?.hands[1]}
          />
        </div>

        <div
          className={[
            "live-owner-profile",
            !inGame ? "is-folded" : "",
            stack >= 100000 ? "has-large-stack" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <Popover
            content={
              <div
                dangerouslySetInnerHTML={{
                  __html: `${card2html(
                    self?.maxCards || []
                  )} <strong style="color: #FF6F00">+$${
                    self?.profits
                  }</strong> `,
                }}
              />
            }
            trigger="click"
            visible={Boolean(self?.isWinner && self.profits >= 0)}
          >
            <Avatar className="live-owner-avatar">YOU</Avatar>
          </Popover>
          <div className="live-owner-copy">
            <div>
              <strong>{name}</strong>
              {position ? (
                <span className="live-owner-position" title={position}>
                  {positionComponent}
                </span>
              ) : null}
            </div>
            <b>{formatChips(stack)}</b>
          </div>
          {isActing ? (
            <Tooltip
              title={`点击加时，需支付其他玩家各 ${formatChips(
                overtimeCost
              )} 筹码`}
            >
              <button
                type="button"
                className="live-owner-timer"
                onClick={() => {
                  ws_overtime();
                  setNow(now + 1);
                }}
              >
                <CountDown time={Math.floor(leftTime / 1000)} now={now} />
                <span>{remainingSeconds}</span>
              </button>
            </Tooltip>
          ) : null}
        </div>

        <div className="live-owner-bet">
          <span>{self?.actionName || (isActing ? "轮到你" : "等待")}</span>
          {bet > 0 ? <b>+{formatChips(bet)}</b> : null}
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
                    onChange={(event) => setRaise(Number(event.target.value))}
                    aria-label="加注筹码"
                  />
                  <label>
                    <span>¥</span>
                    <input
                      type="number"
                      min={minRaise}
                      max={maxRaise}
                      value={raise}
                      onChange={(event) =>
                        setRaise(Number(event.target.value))
                      }
                      aria-label="加注金额"
                    />
                  </label>
                </div>

                <div className="live-raise-presets">
                  {useBB ? (
                    <>
                      <button type="button" onClick={() => setRaise(bb * 2)}>
                        <span>2BB</span>
                        <b>{formatChips(bb * 2)}</b>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRaise(Math.floor(bb * 2.5))}
                      >
                        <span>2.5BB</span>
                        <b>{formatChips(Math.floor(bb * 2.5))}</b>
                      </button>
                      <button type="button" onClick={() => setRaise(bb * 3)}>
                        <span>3BB</span>
                        <b>{formatChips(bb * 3)}</b>
                      </button>
                      <button type="button" onClick={() => setRaise(bb * 4)}>
                        <span>4BB</span>
                        <b>{formatChips(bb * 4)}</b>
                      </button>
                    </>
                  ) : (
                    <>
                      {has1_4 ? (
                        <button
                          type="button"
                          onClick={() => setRaise(Math.ceil(pots / 4))}
                        >
                          <span>¼ 池</span>
                          <b>{formatChips(Math.ceil(pots / 4))}</b>
                        </button>
                      ) : null}
                      {has1_3 ? (
                        <button
                          type="button"
                          onClick={() => setRaise(Math.ceil(pots / 3))}
                        >
                          <span>⅓ 池</span>
                          <b>{formatChips(Math.ceil(pots / 3))}</b>
                        </button>
                      ) : null}
                      {has1_2 ? (
                        <button
                          type="button"
                          onClick={() => setRaise(Math.ceil(pots / 2))}
                        >
                          <span>½ 池</span>
                          <b>{formatChips(Math.ceil(pots / 2))}</b>
                        </button>
                      ) : null}
                      {has2_3 ? (
                        <button
                          type="button"
                          onClick={() => setRaise(Math.ceil((pots * 2) / 3))}
                        >
                          <span>⅔ 池</span>
                          <b>{formatChips(Math.ceil((pots * 2) / 3))}</b>
                        </button>
                      ) : null}
                      {has3_4 ? (
                        <button
                          type="button"
                          onClick={() => setRaise(Math.ceil((pots * 3) / 4))}
                        >
                          <span>¾ 池</span>
                          <b>{formatChips(Math.ceil((pots * 3) / 4))}</b>
                        </button>
                      ) : null}
                      {has1_1 ? (
                        <button
                          type="button"
                          onClick={() => setRaise(Math.ceil(pots))}
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
                onClick={ws_userFold}
              >
                <strong>弃牌</strong>
                <span>FOLD</span>
              </button>
              {canCheck ? (
                <button
                  type="button"
                  className="is-call"
                  onClick={() => ws_userBet(bet)}
                >
                  <strong>过牌</strong>
                  <span>CHECK</span>
                </button>
              ) : null}
              {canCall ? (
                <button
                  type="button"
                  className="is-call"
                  onClick={() => ws_userBet(chips2call + bet)}
                >
                  <strong>跟注 {formatChips(chips2call)}</strong>
                  <span>CALL</span>
                </button>
              ) : null}
              {shouldAllIn ? (
                <button
                  type="button"
                  className="is-raise"
                  onClick={() => ws_userBet(chips2call + bet)}
                >
                  <strong>All-in {formatChips(chips2call)}</strong>
                  <span>ALL IN</span>
                </button>
              ) : canRaise ? (
                onlyRaiseAllIn ? (
                  <button
                    type="button"
                    className="is-raise"
                    onClick={() => ws_userBet(minRaise + bet)}
                  >
                    <strong>All-in {formatChips(minRaise)}</strong>
                    <span>ALL IN</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="is-raise"
                    disabled={raise < minRaise}
                    onClick={() => ws_userBet(raise + bet)}
                  >
                    <strong>加注 {formatChips(raise)}</strong>
                    <span>RAISE</span>
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
                  <small>CHECK / FOLD</small>
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="live-action-idle">
            <span className="live-preaction__indicator" />
            <div>
              <strong>
                {isSettling
                  ? "本手正在结算"
                  : self?.isSpectator
                  ? "当前为观战模式"
                  : self?.isFoled
                  ? "本手已弃牌"
                  : "等待牌局开始"}
              </strong>
              <span>操作区会在需要行动时自动更新</span>
            </div>
            {stack + bet < reBuyLimit * bb &&
            (game?.isSettling ||
              !self?.isInCurrentGame ||
              self?.isFoled) ? (
              <Button type="primary" onClick={() => ws_userRebuy()}>
                再次买入
              </Button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
