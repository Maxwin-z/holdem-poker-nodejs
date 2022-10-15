import {
  Row,
  Col,
  Input,
  InputNumber,
  Button,
  Card,
  Dropdown,
  Menu
} from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import {
  createRoomAsync,
  joinRoomAsync,
  selectStatus
} from './createRoomSlice';
import { logout } from '../home/homeSlice';
import { RecentGameRecords } from './RecentGameRecords';

const style = { padding: '8px 0' };

export function CreateRoom() {
  const dispatch = useAppDispatch();

  const [smallBlind, setSmallBlind] = useState(1);
  const [buyIn, setBuyIn] = useState(200);
  const [roomid, setRoomID] = useState('');
  const status = useAppSelector(selectStatus);

  useEffect(() => {
    setBuyIn(smallBlind * 200);
  }, [smallBlind]);

  return (
    <Row style={{ marginTop: 100 }}>
      <Col span={12} offset={6}>
        <Dropdown
          overlay={
            <Menu>
              <Menu.Item key="0">
                <a onClick={() => dispatch(logout())}>注销</a>
              </Menu.Item>
            </Menu>
          }
          key="a"
        >
          <a
            className="ant-dropdown-link"
            style={{ fontSize: 32, marginBottom: 30, display: 'inline-block' }}
          >
            {localStorage['name']}
            <DownOutlined />
          </a>
        </Dropdown>
        <Card title="创建房间" bordered={false}>
          <div style={style}>
            小盲:
            <InputNumber
              min={1}
              value={smallBlind}
              onChange={(v) => setSmallBlind(v!)}
            />
            / 大盲:
            <InputNumber disabled={true} min={1} value={smallBlind * 2} />
          </div>
          <div style={style}>
            买入:
            <InputNumber min={1} value={buyIn} onChange={(v) => setBuyIn(v!)} />
          </div>
          <div style={style}>
            <Button
              type="primary"
              onClick={() =>
                dispatch(createRoomAsync({ sb: smallBlind, buyIn }))
              }
              loading={status.createRoomStatus == 'loading' ? true : false}
            >
              创建房间
            </Button>
          </div>
        </Card>
      </Col>
      <Col span={12} offset={6} style={{ marginTop: 20 }}>
        <Card title="加入游戏" bordered={false}>
          <div style={style}>
            房间ID:
            <Input
              onChange={(e) => {
                setRoomID(e.target.value);
              }}
            />
          </div>

          <div style={style}>
            <Button
              type="primary"
              onClick={() => {
                dispatch(joinRoomAsync(roomid));
              }}
              loading={status.joinRoomStatus == 'loading' ? true : false}
            >
              加入房间
            </Button>
          </div>
        </Card>

        <RecentGameRecords />
      </Col>
    </Row>
  );
}
