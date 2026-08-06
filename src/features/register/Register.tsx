import { Button, Form, Input } from "antd";
import {
  ArrowRightOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { registerAsync, selectError } from "./registerSlice";

export function Register({ inviteRoomID = "" }: { inviteRoomID?: string }) {
  const dispatch = useAppDispatch();
  const error = useAppSelector(selectError);
  const status = useAppSelector((state) => state.register.status);

  const onFinish = (account: { name: string; password: string }) => {
    dispatch(registerAsync({ account, dispatch }));
  };

  return (
    <main className="lobby-shell lobby-login">
      <div className="lobby-login__ambient" aria-hidden="true">
        <span>♠</span>
        <span>♥</span>
        <span>♦</span>
        <span>♣</span>
      </div>

      <section className="lobby-login__intro">
        <div className="lobby-brand">
          <span className="lobby-brand__mark">♠</span>
          <div>
            <strong>River Club</strong>
            <small>TEXAS HOLD'EM</small>
          </div>
        </div>
        <div className="lobby-login__copy">
          <span className="lobby-eyebrow">PRIVATE POKER TABLE</span>
          <h1>
            和熟悉的人，
            <br />
            随时开一桌。
          </h1>
          <p>轻量、实时、适配手机与桌面的私人德州扑克房间。</p>
        </div>
        <div className="lobby-login__features">
          <span>
            <i />
            十人实时牌桌
          </span>
          <span>
            <i />
            私密房间 ID
          </span>
          <span>
            <i />
            自动保存积分
          </span>
        </div>
      </section>

      <section className="lobby-auth-card">
        <div className="lobby-auth-card__heading">
          <span className="lobby-eyebrow">WELCOME BACK</span>
          <h2>进入牌桌</h2>
          <p>
            {inviteRoomID
              ? `登录后将自动加入房间 ${inviteRoomID}。`
              : "首次使用会自动创建账号，无需额外注册。"}
          </p>
        </div>

        <Form
          className="lobby-form"
          name="account"
          layout="vertical"
          requiredMark={false}
          autoComplete="off"
          onFinish={onFinish}
        >
          <Form.Item
            label="用户名"
            name="name"
            rules={[{ required: true, message: "请输入用户名" }]}
          >
            <Input
              size="large"
              prefix={<UserOutlined />}
              placeholder="输入你的牌桌昵称"
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: "请输入密码" }]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder="输入账号密码"
              autoComplete="current-password"
            />
          </Form.Item>

          {error ? <div className="lobby-form__error">{error}</div> : null}

          <Button
            className="lobby-primary-button"
            type="primary"
            htmlType="submit"
            size="large"
            loading={status === "loading"}
          >
            登录并进入
            <ArrowRightOutlined />
          </Button>
        </Form>

        <div className="lobby-auth-card__security">
          <SafetyCertificateOutlined />
          <span>账号仅用于识别牌桌身份</span>
        </div>
      </section>
    </main>
  );
}
