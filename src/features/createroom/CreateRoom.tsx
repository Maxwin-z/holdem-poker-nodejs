import {
  Button,
  Dropdown,
  Input,
  InputNumber,
  Menu,
} from "antd";
import {
  ArrowRightOutlined,
  DownOutlined,
  LogoutOutlined,
  PlusOutlined,
  RobotOutlined,
  SettingOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import {
  createRoomAsync,
  joinRoomAsync,
  selectStatus,
} from "./createRoomSlice";
import { logout } from "../home/homeSlice";
import {
  RecentGameEntry,
  RecentGameRecords,
} from "./RecentGameRecords";
import { PlayerAnalytics } from "../room/PlayerAnalytics";
import type { PlayerAnalyticsReport } from "../../shared/playerAnalytics";

export function CreateRoom({
  initialRoomID = "",
  previewName,
  previewRecords,
  previewAnalytics,
}: {
  initialRoomID?: string;
  previewName?: string;
  previewRecords?: RecentGameEntry[];
  previewAnalytics?: PlayerAnalyticsReport;
} = {}) {
  const dispatch = useAppDispatch();

  const [smallBlind, setSmallBlind] = useState(1);
  const [buyIn, setBuyIn] = useState(200);
  const [roomid, setRoomID] = useState(initialRoomID);
  const status = useAppSelector(selectStatus);
  const playerName = previewName || localStorage["name"] || "玩家";

  useEffect(() => {
    setBuyIn(smallBlind * 200);
  }, [smallBlind]);

  const accountMenu = (
    <Menu className="lobby-account-menu">
      <Menu.Item key="logout" icon={<LogoutOutlined />}>
        <button type="button" onClick={() => dispatch(logout())}>
          退出登录
        </button>
      </Menu.Item>
    </Menu>
  );

  return (
    <main className="lobby-shell lobby-dashboard">
      <header className="lobby-dashboard__header">
        <div className="lobby-brand">
          <span className="lobby-brand__mark">♠</span>
          <div>
            <strong>River Club</strong>
            <small>PRIVATE TABLES</small>
          </div>
        </div>

        <Dropdown overlay={accountMenu} trigger={["click"]}>
          <Button className="lobby-account-button">
            <span>{playerName.slice(0, 2).toUpperCase()}</span>
            <strong>{playerName}</strong>
            <DownOutlined />
          </Button>
        </Dropdown>
      </header>

      <div className="lobby-dashboard__content">
        <section className="lobby-dashboard__hero">
          <div>
            <span className="lobby-eyebrow">TABLE LOBBY</span>
            <h1>今晚，开一桌？</h1>
            <p>创建自己的牌局，或者使用朋友分享的房间 ID 快速加入。</p>
          </div>
          <span className="lobby-dashboard__online">
            <i />
            服务已连接
          </span>
        </section>

        <section className="lobby-room-actions">
          <article className="lobby-room-card is-create">
            <div className="lobby-room-card__heading">
              <span className="lobby-room-card__icon">
                <PlusOutlined />
              </span>
              <div>
                <small>HOST A TABLE</small>
                <h2>创建房间</h2>
                <p>设置盲注和买入额度，生成私人房间 ID。</p>
              </div>
            </div>

            <div className="lobby-settings-grid">
              <label>
                <span>小盲</span>
                <InputNumber
                  min={1}
                  value={smallBlind}
                  onChange={(value) => setSmallBlind(value!)}
                />
              </label>
              <label>
                <span>大盲</span>
                <InputNumber
                  disabled
                  min={1}
                  value={smallBlind * 2}
                />
              </label>
              <label className="is-wide">
                <span>初始买入</span>
                <InputNumber
                  min={1}
                  value={buyIn}
                  onChange={(value) => setBuyIn(value!)}
                />
                <small>默认小盲的 200 倍</small>
              </label>
            </div>

            <Button
              className="lobby-primary-button"
              type="primary"
              size="large"
              icon={<SettingOutlined />}
              loading={status.createRoomStatus === "loading"}
              onClick={() =>
                dispatch(
                  createRoomAsync({
                    sb: smallBlind,
                    buyIn,
                  })
                )
              }
            >
              创建并进入房间
            </Button>
          </article>

          <article className="lobby-room-card is-join">
            <div className="lobby-room-card__heading">
              <span className="lobby-room-card__icon">
                <TeamOutlined />
              </span>
              <div>
                <small>JOIN A TABLE</small>
                <h2>加入房间</h2>
                <p>输入好友分享的房间 ID，即刻入座。</p>
              </div>
            </div>

            <div className="lobby-join-field">
              <label htmlFor="room-id">房间 ID</label>
              <Input
                id="room-id"
                size="large"
                placeholder="例如：8K21"
                value={roomid}
                maxLength={16}
                onChange={(event) => setRoomID(event.target.value)}
              />
              <span>房间 ID 不区分设备，可从桌面或手机加入</span>
            </div>

            <Button
              className="lobby-secondary-button"
              size="large"
              loading={status.joinRoomStatus === "loading"}
              disabled={!roomid.trim()}
              onClick={() => dispatch(joinRoomAsync(roomid))}
            >
              加入房间
              <ArrowRightOutlined />
            </Button>
          </article>
        </section>

        <div className="lobby-analytics">
          <PlayerAnalytics variant="lobby" previewReport={previewAnalytics} />
        </div>
        {!previewName && (
          <section className="lobby-replay-entry">
            <div>
              <span className="lobby-room-card__icon"><RobotOutlined /></span>
              <div>
                <small>AI HAND REVIEW</small>
                <h2>AI 对局复盘</h2>
                <p>回看最近 100 手人机对局，逐个决策比较实际行动与 GTO 参考策略。</p>
              </div>
            </div>
            <Button size="large" onClick={() => { window.location.href = "/replays"; }}>
              查看复盘 <ArrowRightOutlined />
            </Button>
          </section>
        )}
        <RecentGameRecords previewRecords={previewRecords} />
      </div>
    </main>
  );
}
