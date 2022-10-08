import React, { useState } from "react";

import { useAppSelector, useAppDispatch } from "../../app/hooks";
import { registerAsync, selectError } from "./registerSlice";
import { Form, Input, Button, Row, Col } from "antd";

export function Register() {
  const dispatch = useAppDispatch();
  const error = useAppSelector(selectError);
  const [name, setName] = useState("");
  return (
    <div
      className="flex flex-column flex-center flex1"
      style={{ background: "white" }}
    >
      <Form
        className="flex flex-column flex-center"
        name="basic"
        labelCol={{ span: 8 }}
        wrapperCol={{ span: 16 }}
        onFinish={() => dispatch(registerAsync({ name, dispatch }))}
        autoComplete="off"
        style={{ width: "600px" }}
      >
        <Input
          size="large"
          placeholder="请输入用户名"
          onChange={(e) => setName(e.target.value)}
        />

        <Button type="primary" htmlType="submit" style={{ margin: 20 }}>
          注册
        </Button>
      </Form>
    </div>
  );
}
