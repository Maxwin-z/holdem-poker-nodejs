import React, { useState } from 'react';

import { useAppSelector, useAppDispatch } from '../../app/hooks';
import { registerAsync, selectError } from './registerSlice';
import { Form, Input, Button, Row, Col } from 'antd';

export function Register() {
  const dispatch = useAppDispatch();
  const error = useAppSelector(selectError);

  const onFinish = (account: { name: string; password: string }) => {
    console.log(account);
    dispatch(registerAsync({ account, dispatch }));
  };

  return (
    <div
      className="flex flex-column flex-center flex1"
      style={{ background: 'white' }}
    >
      <Form
        name="basic"
        labelCol={{ span: 8 }}
        wrapperCol={{ span: 16 }}
        initialValues={{ remember: true }}
        autoComplete="off"
        onFinish={onFinish}
      >
        <Form.Item
          label="用户名"
          name="name"
          rules={[{ required: true, message: 'Please input your username!' }]}
        >
          <Input />
        </Form.Item>

        <Form.Item
          label="密码"
          name="password"
          rules={[{ required: true, message: 'Please input your password!' }]}
        >
          <Input.Password />
        </Form.Item>

        <Form.Item wrapperCol={{ offset: 8, span: 16 }}>
          <Button type="primary" htmlType="submit">
            登录即注册
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
