# 翻前 GTO 指导引擎（一期）

预计算的翻前策略引擎：输入局面，输出建议动作、加注尺度、行动频率分布和
参考范围。运行时不求解，全部数据打包在代码里，毫秒级返回，可直接在浏览器
或 Node 服务端使用。

## 覆盖范围

- 玩家数：2-9 人局（10 人按 9 人处理）
- 场景：
  - `unopened`：无人进池，开池加注（RFI）
  - `iso`：面对平跟，隔离加注
  - `vs-open`：面对开池加注（跟注 / 3bet / 弃牌）
  - `vs-3bet`：自己的加注被 3bet（跟注 / 4bet / 5bet 全下）
  - `vs-4bet`：盲注位用图表，其他位置用 5bet 全下/弃牌简化规则
- 位置：6-max 图表（UTG/MP/CO/BTN/SB/BB）按“行动顺序”映射到 2-10 人桌。
  本牌局翻前从 CO 开始行动（CO → MP → UTG → BTN → SB → BB），与标准
  6-max 相反，因此座位不能按“距按钮距离”直接取图表键：第 1 个行动者
  映射为 UTG、第 2 个映射为 MP……展示标签仍用牌局自己的座位名
  （`chartPositionByActionOrder` 负责此映射）
- 筹码：100bb 深码基准；≤20bb 自动切换 push/fold 全下/弃牌模型
- 校准：`looseness` 支持 `tight` / `standard` / `loose`（默认 `standard`）
- 多路修正：有 limper / cold call 时边缘手牌自动收紧，尺寸 +1bb/人

## 数据来源

- 主图表：GreenCharts2024（Greenline Poker），经 MIT 许可的 poker-charts
  项目转载，见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
- MP vs UTG、CO vs MP 两个缺失位置对：本地编写的标准近似表
- 其余未覆盖的位置对（如 CO 面对 UTG 开池、BTN 面对 MP 的 3bet）：
  本地编写的通用近似表（3bet-or-fold / 4bet-跟注），并注明“近似映射”
- ≤20bb push/fold：本地编写的近似 Nash 表（非精确解）

## 使用

```ts
import { getPreflopAdvice, positionForDistance } from "./index";

// 9 人桌，座位 3（=CO），庄家在座位 0
const seat = positionForDistance(9, 3); // { label: "CO", chart: "CO" }

// 牌局内取图表键用行动顺序映射：9 人桌第 0 个行动者（游戏 CO）对应 UTG
const chartKey = chartPositionByActionOrder(9, 0); // "UTG"

const advice = getPreflopAdvice({
  playerCount: 9,
  heroPosition: chartKey,
  heroPositionLabel: seat.label,
  effectiveStackBB: 100,
  scenario: "vs-open",
  villainPosition: "UTG",
  openSizeBB: 3,
  heroHand: "AhKh", // 可选；也可以只给类别 "AKs"
  bigBlindChips: 2, // 可选，输出筹码数
});

advice.recommended;       // "raise"
advice.recommendedSizeBB; // 10.5
advice.hero.message;      // "建议加注到 10.5bb"
advice.actionDistribution; // 范围整体各动作占比（按组合数加权）
advice.ranges;             // 各动作对应的参考手牌列表
```

## 服务端 API

`POST /api/gto/preflop`（服务端已有路由），请求体即
`PreflopSituation`，返回 `PreflopAdvice`。

```json
{
  "playerCount": 9,
  "heroPosition": "BTN",
  "effectiveStackBB": 100,
  "scenario": "vs-open",
  "villainPosition": "UTG",
  "openSizeBB": 3,
  "heroHand": "AKs"
}
```

> 说明：`effectiveStackBB` 为决策深度（bb）。由游戏状态构建时（
> `from-game-state.ts`）：单挑取双方较小筹码（有效筹码），多人局取英雄
> 自身筹码——短码对手只限制其自身可投入的注量，不会拉低开池/加注尺寸。

## 聊天窗口集成（游戏内展示）

游戏内已接入：每次翻前轮到玩家行动时，服务端自动计算该手牌的 GTO 建议，
以结构化日志（`type: "gto"`）只推送给当前行动玩家（保护手牌隐私），
聊天窗口渲染为建议卡片（推荐动作 + 尺度 + 行动频率条）。聊天输入框的
`GTO` 按钮可手动重新请求。

服务端入口：`Game.publishGtoAdvice(token)`（`src/server/service/Room.ts`），
局面构建见 `from-game-state.ts`。

每次翻前建议（自动或手动触发）都会以 JSON 行追加写入
`logs/gto-advice.jsonl`（房间、玩家、手牌、位置、筹码、场景、推荐动作、
尺度、行动频率分布等），供离线分析使用。

# 翻后 GTO 指导引擎（二期：flop / turn / river）

翻后引擎移植自 [gto-poker-overlay](https://github.com/hellomate2/gto-poker-overlay)
（MIT），运行时不求解，毫秒级返回，可直接在浏览器或 Node 服务端使用。

## 覆盖范围

- 街道：flop / turn / river（公共牌 ≥3 张）
- 单挑局面（heads-up）：**面对下注**时由蒸馏神经网络策略决定
  （≈84% 求解器动作一致性，这是它的训练主场），并保留底池赔率硬底线
  （anti-punt）和同花面防护作为只往保守方向的修正
- 单挑**首先行动**（无人下注，选下注还是过牌）：用规则式 lead/c-bet
  策略，不走网络。实测网络在这类局面下注频率与牌力**反相关**
  （0-30% 权益下注 71%，两对只下注 44%，对“是否翻前进攻者”零信号），
  因为该决策只占其训练数据 ~6%，外推失效，详见 `lead.ts` 顶部实测数据
- 多人底池 / 兜底：范围感知启发式——把对手继续范围（继续范围模型
  `range.ts`）显式枚举出来，用英雄对该范围的权益做决策，避免
  “两对在四张同花面价值下注”这类被压制的典型失误
- 合理性闸门（soundness gate）：任何路径的决策都过一遍“跟注价格 /
  筹码承诺”检查，只做更保守的修正（弃牌/过牌）
- 尺寸：网络决定的加注用模型自带的尺寸头（size head，92.4% 验证准确率，
  输出 5 档底池比例）；规则式 lead/c-bet 的下注额仍按牌面纹理
  （干燥 1/3、湿润 2/3、河牌极化）+ 手牌强度给出。两者都会再过最小加注
  下限、取整和全下合法化，超出剩余筹码自动转为全下

## 可信度标签（trust）

`advice.trust` 标的是**实际做出这个决定的机制**，不是决策走过的路径，
建议卡片直接展示，因此不能把手写规则包装成模型输出：

| 标签 | 含义 | 什么时候出现 |
| --- | --- | --- |
| `model` | 蒸馏模型 | 面对下注、网络的 argmax 没被任何守卫改写 |
| `rule` | 简化规则 | 首先行动（lead/c-bet 策略）、同花面防护改写了动作 |
| `heuristic` | 启发式 | 多人底池、anti-punt 底池赔率底线、权益降级、合理性闸门改写了动作 |

## 使用

```ts
import { getPostflopAdvice } from "./index";

const advice = getPostflopAdvice({
  street: "flop",
  heroCards: [cardToId({ num: 14, suit: "h" }), cardToId({ num: 13, suit: "h" })],
  board: [cardToId({ num: 9, suit: "d" }), ...],
  pot: 120,
  currentBet: 0,
  heroBet: 0,
  toCall: 0,
  heroRemaining: 980,
  bigBlind: 2,
  effectiveStackBB: 100,
  activeVillainCount: 1,
  heroInPosition: true,
  isPreflopAggressor: true,
  preflopHasRaise: true,
  threeBetPot: false,
  streetBetCount: 0,
  facedRaiseThisStreet: false,
});

advice.recommended;      // "bet" / "check" / "call" / "fold" / "raise" / "allin"
advice.recommendedSizeChips; // 下注额或加注到总额（筹码）
advice.actionDistribution;   // 行动频率分布（GTO 混合策略）
advice.equityVsRange;        // 对继续范围权益（0-1）
```

## 服务端 API

`POST /api/gto/postflop`，请求体即 `PostflopSituation`，返回
`PostflopAdvice`（字段与上面示例一致）。

## 游戏内展示

游戏内已接入：flop / turn / river 每次轮到玩家行动时，服务端自动计算
GTO 建议，以结构化日志（`type: "gto"`）只推送给当前行动玩家，
聊天窗口渲染为翻后建议卡片（公共牌、推荐动作 + 尺寸、行动频率条、
对继续范围权益、牌面纹理、推理说明），并展示两个附加区块：
“近似/简化说明”（当前局面哪些部分不是精确均衡）和“实际情况偏移建议”
（相对 GTO 基线的实战调整方向，如多人收紧、短码全下化、对手类型偏移等）。
翻前卡片同样展示。聊天输入框的 `GTO` 按钮可手动重新请求。翻后建议同样
写入 `logs/gto-advice.jsonl`（含街道、公共牌、权益等字段）。

## 已知限制（诚实说明）

- 蒸馏网络按单挑场景训练；多人底池走范围启发式，是“实用近似”而非
  精确多人均衡。
- 网络在“首先行动”局面不可用（下注频率与牌力反相关，见上），所以这类
  决策是规则式的、标 `rule`。要真正修好只能上游重训
  （`ml/train.py` + PokerBench），不是在本仓库调权重能解决的。
- 继续范围模型是启发式组合枚举，不是完整对手范围；为控制服务端延迟，
  组合数上限 160（等间隔抽样）。
- 翻后建议未考虑对手剥削性偏差，接近“GTO 基线”而非针对某对手的最优。
- 商用发布前请核对模型训练数据（PokerBench）与算法（phevaluator）的
  原始许可，见 THIRD_PARTY_NOTICES.md。

## 测试

```bash
npm run test:gto
```

## 已知限制（诚实说明）

- 图表是 100bb 深码 6-max 基准，其他筹码深度通过尺寸/全下规则近似，
  没有按深度重新求解。
- 多人底池是单挑图表的收紧修正，不是多人局精确均衡。
- 短码 push/fold 表是近似值，不是精确 Nash；精确求解放到三期。
- 4bet 位置（非盲注位）用的是 5bet 全下/弃牌简化规则。
- 商用发布前请核对图表原始版权（见 THIRD_PARTY_NOTICES.md）。
