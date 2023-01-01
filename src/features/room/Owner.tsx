import {
  Avatar,
  Button,
  Slider,
  InputNumber,
  Tooltip,
  Popover,
  Checkbox,
  Switch,
} from "antd";
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

export function Owner() {
  const hintSoundRef = useRef<HTMLAudioElement>(null);
  const dealCardSoundRef = useRef<HTMLAudioElement>(null);

  const self = useAppSelector(selectSelf);
  const game = useAppSelector(selectGame);
  const room = useAppSelector(selectRoom);

  const selfAsUser = room?.users.find((u) => u.id == self?.id);

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
  const leftTime = (self?.actionEndTime || Date.now()) - Date.now();
  const position = self?.position;
  // const isAllIn = self?.isAllIn || false;

  const canCheck = bet == preBet;
  const canCall = preBet > bet && stack + bet > preBet;
  const canRaise = game?.raiseUser != self?.id;
  const shouldAllIn = stack + bet <= preBet;
  const onlyRaiseAllIn = stack + bet <= raiseBet + raiseBetDiff;
  const minRaise = Math.min(stack, Math.max(bb, raiseBet + raiseBetDiff - bet));
  const maxRaise = stack;
  const has1_3 = stack >= pots / 3 && pots / 3 >= minRaise;
  const has1_2 = stack >= pots / 2 && pots / 2 >= minRaise;
  const has2_3 = stack >= (pots * 2) / 3 && (pots * 2) / 3 >= minRaise;
  const has3_4 = stack >= (pots * 3) / 4 && (pots * 3) / 4 >= minRaise;
  const has1_1 = stack >= pots && pots >= minRaise;
  const chips2call = Math.min(stack, preBet - bet);

  const inGame = self?.isInCurrentGame && self?.isReady && !self?.isFoled;

  const [raise, setRaise] = useState(0);
  const [now, setNow] = useState(0);
  const [autoCheck, setAutoCheck] = useState(false);

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

  return (
    <div className="flex-row flex-center" style={{ height: "100%" }}>
      <audio src={hintsound} autoPlay={false} ref={hintSoundRef} />
      <audio src={dealcardsound} autoPlay={false} ref={dealCardSoundRef} />
      <div className="flex3 flex flex-center">
        <div className={`owner ${!inGame ? "fold" : ""}`}>
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
              ></div>
            }
            trigger="click"
            visible={self?.isWinner && self.profits >= 0}
          >
            <Avatar>{name.length > 0 ? name[0] : ""}</Avatar>
          </Popover>
          <div>{name}</div>
          <div className="stack">
            <span className="coins">$</span>
            {stack}
          </div>
          {stack + bet < reBuyLimit * bb &&
          (game?.isSettling || !self?.isInCurrentGame || self.isFoled) ? (
            <Button type="primary" onClick={() => ws_userRebuy()}>
              再次买入
            </Button>
          ) : null}
          {position != "" ? (
            <div className="position">
              {position == "SB" ? (
                <SmallBlind />
              ) : position == "BB" ? (
                <BigBlind />
              ) : position == "D" ? (
                <Dealer />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex3 flex flex-column" style={{ height: "100%" }}>
        <div className="bet">
          {self?.actionName}
          {bet == 0 ? null : (
            <span>
              <span className="coins">$</span>
              {bet}
            </span>
          )}
        </div>
        <div className="flex1 flex-row flex-center">
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
          {/* {[...(self?.hands || []), null, null].splice(0, 2).map((card, i) => (
            <Poker card={card} index={i} showHand={isSettling} key={`${i}`} />
          ))} */}
          <div>{self?.handsType}</div>
        </div>
        <div className="flex flex-row flex-center">
          {isActing ? (
            <Tooltip title="点击加时">
              <Button
                type="text"
                style={{ width: 300 }}
                onClick={() => {
                  ws_overtime();
                  setNow(now + 1);
                }}
              >
                <CountDown time={Math.floor(leftTime / 1000)} now={now} />
              </Button>
            </Tooltip>
          ) : (
            <div>&nbsp;</div>
          )}
        </div>
      </div>
      <div className="flex4 flex flex-colomn user-actions">
        {isWaiting ? (
          <div>
            <Switch
              checked={autoCheck}
              onChange={() => setAutoCheck(!autoCheck)}
            />
            自动过牌或弃牌
          </div>
        ) : null}
        {isActing ? (
          <>
            <div className="flex1 flex flex-row flex-center main-btn">
              <Button type="primary" size="large" onClick={ws_userFold}>
                弃牌
              </Button>
              {canCheck ? (
                <Button
                  type="primary"
                  size="large"
                  onClick={() => ws_userBet(bet)}
                >
                  过牌
                </Button>
              ) : null}
              {canCall ? (
                <Button
                  type="primary"
                  size="large"
                  onClick={() => ws_userBet(chips2call + bet)}
                >
                  跟注 ${chips2call}
                </Button>
              ) : null}
              {shouldAllIn ? (
                <Button
                  type="primary"
                  size="large"
                  danger
                  onClick={() => ws_userBet(chips2call + bet)}
                >
                  AllIn ${chips2call}
                </Button>
              ) : canRaise ? (
                onlyRaiseAllIn ? (
                  <Button
                    type="primary"
                    size="large"
                    danger
                    onClick={() => ws_userBet(minRaise + bet)}
                  >
                    AllIn ${minRaise}
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    size="large"
                    disabled={raise < minRaise}
                    onClick={() => ws_userBet(raise + bet)}
                  >
                    加注 ${raise}
                  </Button>
                )
              ) : null}
            </div>
            {canRaise ? (
              <div className="flex1 flex flex-row flex-center">
                {has1_3 ? (
                  <Button onClick={() => setRaise(Math.ceil(pots / 3))}>
                    1/3
                  </Button>
                ) : null}
                {has1_2 ? (
                  <Button onClick={() => setRaise(Math.ceil(pots / 2))}>
                    1/2
                  </Button>
                ) : null}
                {has2_3 ? (
                  <Button onClick={() => setRaise(Math.ceil((pots * 2) / 3))}>
                    2/3
                  </Button>
                ) : null}
                {has3_4 ? (
                  <Button onClick={() => setRaise(Math.ceil((pots * 3) / 4))}>
                    3/4
                  </Button>
                ) : null}
                {has1_1 ? (
                  <Button onClick={() => setRaise(Math.ceil(pots))}>
                    1Pots
                  </Button>
                ) : null}
                <InputNumber
                  min={minRaise}
                  max={maxRaise}
                  value={raise}
                  onChange={(v) => setRaise(v!)}
                />
              </div>
            ) : null}

            <div className="flex1 flex flex-row flex-center">
              <span className="coins">$</span>
              <Slider
                min={minRaise}
                max={maxRaise}
                onChange={setRaise}
                style={{ width: 200 }}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
