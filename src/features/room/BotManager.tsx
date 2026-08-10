import {
  DeleteOutlined,
  PlusOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { Button, Modal, Popconfirm, Select, Switch, Tag, Tooltip } from "antd";
import { useState } from "react";
import type { BotStyleSelection } from "../../ApiType";
import {
  ws_addBot,
  ws_removeBot,
  ws_setBotAutoReveal,
} from "../../app/websocket";
import { useAppSelector } from "../../app/hooks";
import { selectRoom } from "./roomSlice";

const STYLE_LABELS = {
  random: "随机",
  standard: "Standard",
  tight: "Tight",
  loose: "Loose",
};

export function BotManager() {
  const room = useAppSelector(selectRoom);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<BotStyleSelection>("random");
  const bots = room?.users.filter((user) => user.isBot) || [];
  const seatedCount =
    room?.users.filter((user) => !user.isSpectator).length || 0;

  return (
    <>
      <Tooltip title="管理AI机器人">
        <Button
          className="live-room-icon-button"
          icon={<RobotOutlined />}
          aria-label="管理AI机器人"
          onClick={() => setOpen(true)}
        />
      </Tooltip>
      <Modal
        visible={open}
        title="AI 机器人"
        footer={null}
        onCancel={() => setOpen(false)}
        destroyOnClose
        className="live-bot-manager"
      >
        <div className="live-bot-manager__add">
          <Select
            aria-label="AI机器人风格"
            value={style}
            onChange={(value) => setStyle(value as BotStyleSelection)}
          >
            {(Object.keys(STYLE_LABELS) as BotStyleSelection[]).map((value) => (
              <Select.Option value={value} key={value}>
                {STYLE_LABELS[value]}
              </Select.Option>
            ))}
          </Select>
          <Button
            className="live-bot-manager__invite"
            type="primary"
            icon={<PlusOutlined />}
            disabled={seatedCount >= 10}
            onClick={() => ws_addBot(style)}
          >
            邀请机器人
          </Button>
        </div>
        <p className="live-bot-manager__capacity">
          当前座位 {seatedCount}/10；随机风格的实际策略仅由系统内部决定。
        </p>
        <div className="live-bot-manager__reveal">
          <div className="live-bot-manager__reveal-copy">
            <strong>AI自动秀牌</strong>
            <small>开启后，每手结算时所有AI机器人都会亮出手牌（含已弃牌）。</small>
          </div>
          <Switch
            aria-label="AI自动秀牌"
            checked={Boolean(room?.botAutoReveal)}
            disabled={bots.length === 0 && !room?.botAutoReveal}
            onChange={(checked) => ws_setBotAutoReveal(checked)}
          />
        </div>
        <div className="live-bot-manager__list">
          {bots.length === 0 ? (
            <div className="live-bot-manager__empty">还没有AI机器人</div>
          ) : (
            bots.map((bot) => (
              <div className="live-bot-manager__row" key={bot.id}>
                <span className="live-bot-manager__avatar">
                  <RobotOutlined />
                </span>
                <div>
                  <strong>{bot.name}</strong>
                  <Tag>{STYLE_LABELS[bot.botStyle || "standard"]}</Tag>
                </div>
                {bot.pendingBotRemoval ? (
                  <Tag color="orange">下一手离桌</Tag>
                ) : (
                  <Popconfirm
                    title="机器人会完成当前手，并从下一手开始离桌。"
                    okText="移除"
                    cancelText="取消"
                    onConfirm={() => ws_removeBot(bot.id)}
                  >
                    <Button
                      danger
                      type="text"
                      icon={<DeleteOutlined />}
                      aria-label={`移除${bot.name}`}
                    />
                  </Popconfirm>
                )}
              </div>
            ))
          )}
        </div>
      </Modal>
    </>
  );
}
