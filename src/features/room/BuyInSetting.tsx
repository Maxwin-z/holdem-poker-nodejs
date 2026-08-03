import { SettingOutlined } from "@ant-design/icons";
import { Button, InputNumber, Modal, Slider } from "antd";
import { useState } from "react";
import { ws_setNextBuyIn } from "../../app/websocket";
import { useAppSelector } from "../../app/hooks";
import { selectRoom, selectSelf } from "./roomSlice";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function BuyInSettingButton({
  className,
  compact = false,
  size,
  onOpen,
}: {
  className?: string;
  compact?: boolean;
  size?: "large";
  onOpen?: () => void;
}) {
  const room = useAppSelector(selectRoom);
  const self = useAppSelector(selectSelf);
  const minBuyIn = room?.minBuyIn || 0;
  const maxBuyIn = Math.max(minBuyIn, room?.maxBuyIn || minBuyIn);
  const defaultBuyIn = clamp(
    self?.nextBuyIn ?? self?.stack ?? minBuyIn,
    minBuyIn,
    maxBuyIn
  );
  const [visible, setVisible] = useState(false);
  const [buyIn, setBuyIn] = useState(defaultBuyIn);

  const valid =
    Number.isInteger(buyIn) && buyIn >= minBuyIn && buyIn <= maxBuyIn;
  const buttonText = self?.nextBuyIn
    ? `带入 ${self.nextBuyIn.toLocaleString("en-US")}`
    : "设置带入码量";

  function open() {
    onOpen?.();
    setBuyIn(defaultBuyIn);
    setVisible(true);
  }

  function save() {
    if (!valid) return;
    ws_setNextBuyIn(buyIn);
    setVisible(false);
  }

  return (
    <>
      <Button
        className={className}
        size={size}
        icon={<SettingOutlined />}
        aria-label="设置下一手带入码量"
        onClick={open}
      >
        {compact ? null : buttonText}
      </Button>
      <Modal
        title={
          <div className="live-buyin-modal__heading">
            <span>♠</span>
            <div>
              <small>NEXT HAND</small>
              <strong>设置下一手带入码量</strong>
            </div>
          </div>
        }
        visible={visible}
        okText="保存设置"
        cancelText="取消"
        wrapClassName="live-buyin-modal"
        maskStyle={{ background: "rgba(2, 8, 6, 0.78)", backdropFilter: "blur(5px)" }}
        okButtonProps={{ disabled: !valid }}
        onOk={save}
        onCancel={() => setVisible(false)}
        destroyOnClose
        centered
      >
        <div className="live-buyin-setting">
          <div className="live-buyin-setting__range">
            <div>
              <small>最小买入</small>
              <strong>{minBuyIn.toLocaleString("en-US")}</strong>
            </div>
            <i>—</i>
            <div>
              <small>CHIP LEADER</small>
              <strong>{maxBuyIn.toLocaleString("en-US")}</strong>
            </div>
          </div>
          <div className="live-buyin-setting__control">
            <label>
              <span>下一手带入</span>
              <InputNumber
                min={minBuyIn}
                max={maxBuyIn}
                step={1}
                precision={0}
                value={buyIn}
                aria-label="下一手带入筹码"
                onChange={(value) =>
                  setBuyIn(typeof value === "number" ? value : minBuyIn)
                }
              />
            </label>
            <Slider
              min={minBuyIn}
              max={maxBuyIn}
              step={1}
              value={buyIn}
              tooltipVisible={false}
              onChange={(value: number) => setBuyIn(value)}
            />
            <div className="live-buyin-setting__scale">
              <span>{minBuyIn.toLocaleString("en-US")}</span>
              <span>{maxBuyIn.toLocaleString("en-US")}</span>
            </div>
          </div>
          <p>
            <span>i</span>
            点击保存只记录目标值；点击“准备下一手”后才会计入筹码和积分买入。
          </p>
        </div>
      </Modal>
    </>
  );
}
