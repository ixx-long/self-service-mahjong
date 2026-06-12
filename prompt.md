你是一个资深全栈工程师，精通微信小程序原生开发与微信云开发（传统模式）。请按本 prompt 生成完整的"自助麻将馆"小程序项目——`SelfServiceMahjong`。

本 prompt 分两部分：
- **第一部分：项目宪法**——全局规范，每个阶段都要遵守。
- **第二部分：阶段 Prompt**——共 8 个阶段，每次取"完整宪法 + 当前阶段"喂给 AI，逐阶段生成。

---

# 第一部分：项目宪法

## 1. 项目概述与功能范围

基于微信小程序的自助麻将馆系统。用户浏览附近门店 → 预约桌位时段 → 在线支付 → 获取开门码 → 到店扫码开台 → 自动计时计费 → 结束结算。管理员可管理门店、桌位、定价、订单、用户，查看统计，回复客服消息。

**核心功能清单：**

**用户端**
1. 微信授权登录（获取 openid，新用户自动注册）
2. 首页：附近门店列表 + 距离 + 空闲桌数
3. 门店详情：日期选择 + 桌位时段展示 + 预约
4. 确认预约与支付（模拟微信支付）
5. 开门码（动态二维码，5 分钟有效）
6. 订单管理：待支付/已支付/进行中/已完成/已取消
7. 个人中心：余额/会员卡、消费记录、设置
8. 消息订阅通知（支付成功、开台提醒、超时预警、完成通知）
9. 订单评价系统
10. 在线客服

**管理端**
1. 门店管理（增删改查）
2. 桌位管理
3. 时段定价规则
4. 订单管理（筛选、退款、强制结束）
5. 用户管理（拉黑/解封）
6. 经营统计（日/周/月营收）
7. 系统设置（管理员 openid 列表、全局参数）
8. 客服消息回复

## 2. 技术架构

- **前端**：微信小程序原生开发，用户端与管理端在同一小程序内，通过"我的"页面中管理员可见入口区分
- **后端**：微信云开发传统模式——云数据库 + 云函数 + 云存储
- **无自建服务器**，所有后端逻辑由云函数承载
- **模拟支付**：云函数直接返回支付成功，不接入真实支付接口
- **开门码签名算法**：`SHA256(orderId + timestamp + 密钥)`，密钥存于 `settings` 集合

## 3. 数据库 Schema

### 3.1 集合清单与字段

```yaml
# users —— 用户表（仅创建者可读写）
users:
  _openid: string          # 自动
  nickName: string
  avatarUrl: string
  phone: string
  balance: number          # 余额，默认 0
  role: 'user' | 'admin'   # 默认 'user'
  isBlocked: boolean       # 默认 false
  createTime: date

# stores —— 门店表（所有人可读，仅管理员可写）
stores:
  name: string
  address: string
  location: GeoPoint       # 经纬度，用于附近搜索
  phone: string
  openTime: string         # 如 "10:00"
  closeTime: string        # 如 "02:00"
  tablesCount: number
  status: 'open' | 'closed'
  createTime: date

# tables —— 桌位表
tables:
  storeId: string          # 关联 stores._id
  tableNo: string          # 桌号
  type: 'auto' | 'normal'  # 自动麻将桌/普通
  status: 'idle' | 'in_use' | 'reserved' | 'maintenance'
  hourlyPrice: number      # 默认每小时单价
  createTime: date

# time_slots —— 时段占用表
time_slots:
  storeId: string
  date: string             # "2026-06-10"
  tableId: string
  slot: string             # "10:00-14:00" 等时段标识
  status: 'free' | 'booked' | 'occupied'
  orderId: string | null
  createTime: date

# orders —— 订单表
orders:
  userId: string
  storeId: string
  tableId: string
  date: string
  timeSlot: string
  amount: number           # 预约预付金额
  discountAmount: number   # 实际支付金额
  status: 'pending' | 'paid' | 'using' | 'completed' | 'cancelled'
  payTime: date | null
  startTime: date | null   # 扫码开台时间
  endTime: date | null     # 结束时间
  actualAmount: number | null  # 实际结算金额
  doorCodeSign: string | null  # 开门码签名
  doorCodeExpire: date | null  # 开门码过期时间
  createTime: date

# reviews —— 评价表
reviews:
  userId: string
  storeId: string
  orderId: string
  rating: number           # 1-5 星
  content: string
  images: string[]         # 云存储 fileID 数组
  createTime: date

# service_messages —— 客服消息表
service_messages:
  _openid: string          # 发送者 openid
  content: string
  type: 'text' | 'image'
  from: 'user' | 'admin'
  createTime: date

# notifications —— 通知记录表
notifications:
  _openid: string          # 接收者
  templateId: string
  type: 'pay_success' | 'start_use' | 'timeout_warning' | 'complete'
  data: object             # 模板消息字段
  sendTime: date
  status: 'success' | 'fail'

# settings —— 系统设置表
settings:
  key: string              # 如 "adminOpenIds", "overTimeRate", "doorCodeSecret"
  value: any
```

### 3.2 数据库安全规则

| 集合 | 读 | 写 |
|------|----|-----|
| `users` | 仅创建者可读 | 仅创建者可写 |
| `stores` | 所有人可读 | 仅管理员可写 |
| `tables` | 所有人可读 | 仅管理员可写 |
| `time_slots` | 所有人可读 | 仅管理员及对应订单用户可写 |
| `orders` | 创建者可读 | 创建者可写（部分字段管理员可写） |
| `reviews` | 所有人可读 | 仅创建者可写（不可修改） |
| `service_messages` | 创建者可读 | 创建者可写 |
| `notifications` | 创建者可读 | 仅云函数可写 |
| `settings` | 不开放客户端读 | 仅管理员云函数可写 |

> 在 `database/db_init.md` 或 `README.md` 中详细描述安全规则 JSON 配置。

## 4. 页面路由表

**用户端 TabBar：**
| Tab | 路径 | 说明 |
|-----|------|------|
| 首页 | `pages/index/index` | 门店列表 |
| 订单 | `pages/orders/orders` | 我的订单 |
| 我的 | `pages/mine/mine` | 个人中心 |

**用户端子页面：**
| 路径 | 说明 |
|------|------|
| `pages/store/store` | 门店详情 + 桌位时段选择 |
| `pages/confirm/confirm` | 确认预约 |
| `pages/orderDetail/orderDetail` | 订单详情（含开门码） |
| `pages/review/review` | 写评价 |
| `pages/service/service` | 客服会话 |

**管理端页面（从 mine 进入，仅管理员可见）：**
| 路径 | 说明 |
|------|------|
| `pages/admin/dashboard/dashboard` | 管理仪表盘 |
| `pages/admin/stores/stores` | 门店管理 |
| `pages/admin/tables/tables` | 桌位管理 |
| `pages/admin/orders/orders` | 订单管理 |
| `pages/admin/users/users` | 用户管理 |
| `pages/admin/service/service` | 客服消息回复 |
| `pages/admin/settings/settings` | 系统设置 |

**公共组件：**
| 路径 | 说明 |
|------|------|
| `components/store-card/store-card` | 门店卡片 |
| `components/table-slot-picker/table-slot-picker` | 桌位时段选择器 |
| `components/star-rating/star-rating` | 星级评分组件 |

## 5. UI 设计规范

- **主色**：金色 `#D4AF37`，**辅助色**：深红 `#8B0000`，**背景**：白色 `#FFFFFF`，卡片阴影、圆角 8px
- **桌位状态色**：空闲绿 `#4CAF50`、使用中红 `#F44336`、已预约橙 `#FF9800`、维修灰 `#9E9E9E`
- 图标优先使用微信原生 API，核心操作加自定义简约图标
- 所有列表支持 `enablePullDownRefresh`
- 空白状态需有占位提示（图标 + 文案）
- 按钮主操作金色背景白字，禁用态灰色
- Toast 错误提示 + Modal 关键确认

## 6. 全局约定

- **命名**：页面/组件用 kebab-case，云函数用 camelCase，集合名 snake_case
- **代码注释**：关键逻辑必须注释，每个云函数顶部注明入参/出参/错误码
- **错误处理**：所有云函数 `try-catch`，返回统一结构 `{ code: 0, data: ..., msg: 'ok' }`，非 0 为错误
- **时间格式**：统一用 ISO 8601 字符串存储，前端展示按北京时间格式化
- **分页**：列表类查询默认 `pageSize=20`，支持 `skip`
- **软删除**：不建议物理删除，用状态字段标记

## 7. 云函数清单

| 云函数 | 功能 | 主要入参 | 主要出参 |
|--------|------|----------|----------|
| `getOpenId` | 获取用户 openid + 用户信息 | 无（从 context 取） | `{ user }` |
| `getNearbyStores` | 附近门店列表 | `latitude, longitude, radius?` | `{ stores[] }` |
| `getStoreDetail` | 门店详情 + 某日桌位时段 | `storeId, date` | `{ store, tables[], slots[], reviews[], avgRating }` |
| `createOrder` | 创建预约 | `storeId, tableId, date, timeSlot` | `{ orderId, amount }` |
| `payOrder` | 模拟支付 | `orderId` | `{ order }` |
| `generateDoorCode` | 生成开门码 | `orderId` | `{ doorCode, expireTime }` |
| `verifyDoorCode` | 验证开门码 | `doorCode`（扫码内容） | `{ order }` |
| `finishOrder` | 结束使用 + 结算 | `orderId` | `{ order, refund?, charge? }` |
| `cancelOrder` | 取消订单 | `orderId` | `{ order }` |
| `submitReview` | 提交评价 | `orderId, rating, content, images?` | `{ review }` |
| `sendServiceMessage` | 发送客服消息 | `content, type` | `{ message }` |
| `getServiceMessages` | 获取客服消息列表 | `page?` | `{ messages[] }` |
| `sendSubscribeMessage` | 发送订阅通知（云函数内部调用） | `type, orderId` | `{ success }` |
| `adminManage` | 管理端统一入口 | `action, payload` | 按 action 返回 |
| `checkTimeout` | 定时触发器：检查超时订单 | 无 | `{ processed }` |
| `initDatabase` | 数据库初始化 | 无 | `{ result }` |

---

# 第二部分：阶段 Prompt

> **使用说明**：每次取"完整宪法（第一部分）+ 当前阶段 Prompt"一起发给 AI。AI 必须先理解宪法，然后仅完成当前阶段的任务，不提前生成后续阶段代码。

---

## S1：项目骨架 + 云函数基础

**依赖**：无

**输入**：宪法第 2 章（技术架构）、第 6 章（全局约定）

**输出文件清单：**
```
SelfServiceMahjong/
├── project.config.json
├── README.md                      # 项目说明（初始版，后续补充）
├── miniprogram/
│   ├── app.js
│   ├── app.json
│   ├── app.wxss                   # 全局样式（主色、辅助色、状态色变量）
│   ├── sitemap.json
│   └── utils/
│       ├── util.js                # 工具函数（时间格式化、请求封装等）
│       └── cloud.js               # 云开发初始化封装
└── cloudfunctions/
    └── getOpenId/
        ├── index.js
        ├── config.json
        └── package.json
```

**任务描述：**
1. 创建 `project.config.json`，配置云开发根目录为 `cloudfunctions/`
2. 创建 `miniprogram/app.js`：初始化云开发环境，全局数据管理（用户信息、定位）
3. 创建 `miniprogram/app.json`：注册 TabBar（首页/订单/我的），配置路由权限
4. 创建 `miniprogram/app.wxss`：定义 CSS 变量（色值、字号、间距），全局基础样式，桌位状态色类名
5. 创建 `utils/util.js`：时间格式化、金额格式化、距离格式化等通用函数
6. 创建 `utils/cloud.js`：封装 `wx.cloud.callFunction` 为 Promise，统一错误处理
7. 创建 `getOpenId` 云函数：从 `wxContext.OPENID` 获取 openid，查询 `users` 集合，存在则返回用户信息，不存在则创建新用户后返回

**验证标准：**
- [ ] `project.config.json` 结构正确，`cloudfunctionRoot` 指向 `cloudfunctions/`
- [ ] `app.json` 中 TabBar 配置完整，至少含 3 个 tab
- [ ] 全局样式文件定义了所有设计规范中的色值变量
- [ ] `getOpenId` 云函数本地调试通过，能正确返回/创建用户
- [ ] 微信开发者工具能成功打开项目，编译无报错

---

## S2：数据库设计 + 初始化

**依赖**：S1（项目骨架就绪）

**输入**：宪法第 3 章（数据库 Schema）、第 3.2 节（安全规则）

**输出文件清单：**
```
cloudfunctions/
└── initDatabase/
    ├── index.js                   # 初始化云函数
    ├── config.json
    └── package.json
miniprogram/
└── database/
    └── db_init.md                 # 安全规则 JSON 配置说明
README.md                          # 更新：部署步骤、初始化方法
```

**任务描述：**
1. 完善 `README.md`：
   - 项目启动步骤：导入云开发 → 部署云函数 → 创建数据库集合 → 运行 `initDatabase`
   - 集合创建顺序
   - 数据库安全规则配置方法
2. 创建 `database/db_init.md`：
   - 列出所有 9 个集合名称
   - 每个集合的安全规则 JSON（按宪法 3.2 表配置）
   - 索引建议（如 `stores.location` 需建 geo 索引，`orders.userId`、`orders.status` 需建普通索引）
3. 创建 `initDatabase` 云函数：
   - 初始化 `settings` 集合：写入 `adminOpenIds`（空数组，手动填入）、`overTimeRate`（超时罚款倍率，默认 1.5）、`doorCodeSecret`（开门码签名密钥，随机生成 32 位）、`timeSlots`（默认时段列表：`["10:00-14:00", "14:00-18:00", "18:00-22:00", "22:00-02:00"]`）
   - 创建 geo 索引提示（注释说明需在云开发控制台手动为 `stores.location` 添加地理位置索引）

**验证标准：**
- [ ] `README.md` 步骤清晰，新手可照做完成初始化
- [ ] `db_init.md` 安全规则 JSON 语法正确且与宪法一致
- [ ] `initDatabase` 执行后，`settings` 集合中存在 4 条初始化记录
- [ ] `initDatabase` 可重复执行不报错（使用 upsert 逻辑）

---

## S3：用户端核心流程

**依赖**：S2（数据库就绪）

**输入**：宪法第 4 章（路由）、第 5 章（UI）、云函数 `createOrder`+`payOrder` 签名

**输出文件清单：**
```
miniprogram/pages/index/
├── index.js / index.wxml / index.wxss / index.json
miniprogram/pages/store/
├── store.js / store.wxml / store.wxss / store.json
miniprogram/pages/confirm/
├── confirm.js / confirm.wxml / confirm.wxss / confirm.json
cloudfunctions/getNearbyStores/
├── index.js / config.json / package.json
cloudfunctions/getStoreDetail/
├── index.js / config.json / package.json
cloudfunctions/createOrder/
├── index.js / config.json / package.json
cloudfunctions/payOrder/
├── index.js / config.json / package.json
```

**任务描述：**

**首页 `pages/index/index`：**
1. 进入时获取用户位置（`wx.getLocation`），若用户拒绝则使用默认坐标
2. 调用 `getNearbyStores` 云函数获取门店列表（距离排序）
3. 列表每项展示：门店名称、地址、距离（<1km 显示米）、空闲桌数/总桌数（如"3/8 空闲"）
4. 点击卡片跳转门店详情 `pages/store/store?storeId=xxx`
5. 下拉刷新、空状态提示

**门店详情 `pages/store/store`：**
1. 顶部：门店名称、地址、电话（可拨打）、营业时间
2. 日期选择器：默认今天，可选今天起 7 天
3. 调用 `getStoreDetail` 获取桌位列表 + 时段占用
4. 每张桌位一行：桌号、类型、状态圆点
5. 时段网格：4 个时段，空闲白色可点击，已占用灰色不可点，已选中金色高亮
6. 用户选空闲时段 → 跳转确认页 `pages/confirm/confirm?storeId=&tableId=&date=&slot=`

**确认预约 `pages/confirm/confirm`：**
1. 展示：门店名、桌号、日期、时段、费用明细
2. "确认支付"按钮 → 调用 `createOrder` → `payOrder` → 跳转订单详情
3. 调用 `sendSubscribeMessage` 请求支付成功通知订阅
4. 处理并发预约冲突（`createOrder` 检查时段是否已被占用）

**云函数：**
- `getNearbyStores`：用 `db.command.geoNear` 按距离排序返回门店 + 实时空闲桌数
- `getStoreDetail`：返回门店信息 + 某日所有桌位 + 时段占用 + 评价摘要（平均分、条数）
- `createOrder`：校验时段是否空闲 → 创建订单（status='pending'）→ 创建 `time_slots` 记录（status='booked'）→ 返回 `orderId`
- `payOrder`：接收 `orderId` → 校验订单归属 → 更新 `status='paid'` + `payTime` → 返回订单

**验证标准：**
- [ ] 首页展示列表，点击进入门店详情
- [ ] 日期切换后时段占用数据刷新
- [ ] 已占用时段不可点击
- [ ] 确认预约 → 支付 → 订单状态变为 paid
- [ ] 并发预约同一时段时，后到的请求返回冲突错误
- [ ] 下拉刷新、空状态均正常

---

## S4：开门码 + 订单生命周期

**依赖**：S3（可创建并支付订单）

**输入**：宪法第 1 章（开门码说明）、云函数签名

**输出文件清单：**
```
miniprogram/pages/orders/
├── orders.js / orders.wxml / orders.wxss / orders.json
miniprogram/pages/orderDetail/
├── orderDetail.js / orderDetail.wxml / orderDetail.wxss / orderDetail.json
cloudfunctions/generateDoorCode/
├── index.js / config.json / package.json
cloudfunctions/verifyDoorCode/
├── index.js / config.json / package.json
cloudfunctions/finishOrder/
├── index.js / config.json / package.json
cloudfunctions/cancelOrder/
├── index.js / config.json / package.json
```

**任务描述：**

**订单列表 `pages/orders/orders`：**
1. Tab 切换：全部 / 待支付 / 已支付 / 进行中 / 已完成 / 已取消
2. 每项展示：门店名、日期、时段、金额、状态标签
3. 不同状态不同操作按钮：
   - 待支付：去支付 → `payOrder`
   - 已支付：开门码 → 跳转订单详情（开门码区域高亮）
   - 进行中：显示已用时长
   - 已完成：去评价（若未评价）

**订单详情 `pages/orderDetail/orderDetail`：**
1. 完整订单信息 + 时间轴（创建 → 支付 → 开台 → 结束）
2. 已支付状态：显示开门码（调用 `generateDoorCode` 生成二维码图片），5 分钟倒计时过期提示，可重新生成
3. 进行中状态：实时计时器（`setInterval` 每秒更新），显示"已用 X 时 X 分" + 预计费用
4. "结束使用"按钮 → 调用 `finishOrder` → 显示结算结果（多退少补）
5. 已完成状态：显示评价入口

**云函数：**
- `generateDoorCode`：验证订单归属 + 状态为 paid → 生成 `SHA256(orderId + timestamp + doorCodeSecret)` → 存签名到订单 → 返回 `orderId|timestamp|sign` 字符串
- `verifyDoorCode`（由管理员端或扫描方调用）：解析二维码字符串 → 验证签名 + 5 分钟有效期 → 更新订单 `status='using'`, `startTime` → 更新桌位 `status='in_use'` → 更新 `time_slots.status='occupied'`
- `finishOrder`：计算实际费用 = 每小时单价 × 实际使用时长（向上取整小时）→ 预付金额对比 → 多退（增加余额）少补（模拟扣款）→ 更新 `status='completed'`, `endTime`, `actualAmount` → 释放桌位
- `cancelOrder`：仅待支付/已支付（未开台）可取消，已支付订单退款到余额

**验证标准：**
- [ ] 订单列表 Tab 切换正确筛选
- [ ] 开门码生成 + 扫码验证完整流程可走通（管理员端扫码或另一个手机扫码）
- [ ] 进行中订单实时计时准确
- [ ] 结束结算退补计算正确
- [ ] 取消订单状态变更正确

---

## S5：个人中心 + 消息订阅

**依赖**：S4（订单流程完整）

**输入**：宪法第 1 章（个人中心+消息订阅部分）、云函数签名

**输出文件清单：**
```
miniprogram/pages/mine/
├── mine.js / mine.wxml / mine.wxss / mine.json
cloudfunctions/sendSubscribeMessage/
├── index.js / config.json / package.json
```

**任务描述：**

**个人中心 `pages/mine/mine`：**
1. 顶部：头像、昵称、会员标签
2. 余额展示 + "充值"按钮（模拟充值，输入金额直接加到余额）
3. 功能列表：消费记录（跳转订单列表）、我的评价、联系客服（跳转 `pages/service/service`）
4. 设置：修改昵称、修改手机号
5. 管理端入口：调用云函数验证角色，仅 `role='admin'` 时显示，点击进入 `pages/admin/dashboard/dashboard`
6. 退出登录（清除本地缓存 + 跳转登录）

**消息订阅通知 `sendSubscribeMessage`（云函数内部调用，也整合到各业务云函数中）：**
1. 在小程序端用 `wx.requestSubscribeMessage` 获取授权（模板 ID 配置在 `app.json` 全局）
2. 在以下时机触发通知：
   - `payOrder` 成功后 → 发送"支付成功通知"
   - `verifyDoorCode` 成功后 → 发送"开台提醒"
   - `checkTimeout` 检测到超时前 10 分钟 → 发送"超时预警"
   - `finishOrder` 完成后 → 发送"消费完成通知"
3. 通知结果写入 `notifications` 集合

> 注意：模板消息需在微信公众平台申请，代码中模板 ID 用占位符 `TEMPLATE_ID_XXX`，在 `README.md` 中说明申请步骤。

**验证标准：**
- [ ] 个人中心信息展示正确
- [ ] 管理员可见管理端入口，普通用户不可见
- [ ] 模拟充值余额变化正确
- [ ] 订阅消息在对应时机触发（检查 `notifications` 集合记录）

---

## S6：管理端

**依赖**：S5（用户体系完整，角色区分就绪）

**输入**：宪法第 1 章（管理端功能）、第 4 章（管理端路由）、云函数签名

**输出文件清单：**
```
miniprogram/pages/admin/dashboard/
├── dashboard.js / dashboard.wxml / dashboard.wxss / dashboard.json
miniprogram/pages/admin/stores/
├── stores.js / stores.wxml / stores.wxss / stores.json
miniprogram/pages/admin/tables/
├── tables.js / tables.wxml / tables.wxss / tables.json
miniprogram/pages/admin/orders/
├── orders.js / orders.wxml / orders.wxss / orders.json
miniprogram/pages/admin/users/
├── users.js / users.wxml / users.wxss / users.json
miniprogram/pages/admin/settings/
├── settings.js / settings.wxml / settings.wxss / settings.json
cloudfunctions/adminManage/
├── index.js / config.json / package.json
cloudfunctions/checkTimeout/
├── index.js / config.json / package.json
```

**任务描述：**

**管理仪表盘 `pages/admin/dashboard/dashboard`：**
1. 今日/本周/本月营收卡片
2. 当前各门店使用率（在用人次/总桌位）
3. 待处理客服消息数
4. 快捷入口：订单管理、门店管理

**门店管理 `pages/admin/stores/stores`：**
1. 门店列表 → 新增/编辑门店表单
2. 字段：名称、地址、坐标（自动获取或手动输入经纬度）、电话、营业时间、桌位数

**桌位管理 `pages/admin/tables/tables`：**
1. 选择门店 → 展示该门店桌位列表
2. 新增桌位：桌号、类型（自动/普通）、默认单价
3. 编辑：修改单价、状态（正常/维修）
4. 时段定价：为每个门店设置不同时段的单价倍率（如黄金时段 ×1.5）

**订单管理 `pages/admin/orders/orders`：**
1. 按门店筛选 + 按状态筛选
2. 手动操作：退款（全额退回余额）、强制结束订单

**用户管理 `pages/admin/users/users`：**
1. 用户列表（搜索 openid/昵称）
2. 拉黑/解封操作

**系统设置 `pages/admin/settings/settings`：**
1. 编辑 `settings` 集合中的全局参数：管理员 openid 列表、超时费率、开门码密钥

**云函数：**
- `adminManage`：统一的 `action` 分发——
  - `manageStore`：增删改门店
  - `manageTable`：增删改桌位
  - `getUserList`：分页查询用户列表
  - `blockUser`：拉黑/解封
  - `getOrderList`：多条件分页查询
  - `refundOrder`：退款
  - `forceFinish`：强制结束订单
  - `getStatistics`：日/周/月营收统计
  - `updateSetting`：修改系统设置
- `checkTimeout`：定时触发器（建议每 5 分钟触发）——
  - 查询 `status='using'` 的订单
  - 判断是否超过预约时段结束时间或门店打烊时间
  - 超时自动调用 `finishOrder` 结算逻辑，按超时费率计算
  - 发送超时提醒通知

**验证标准：**
- [ ] 管理端所有页面仅管理员可访问（页面 `onLoad` 时二次校验）
- [ ] 门店/桌位增删改查正确
- [ ] 订单筛选、退款、强制结束功能正确
- [ ] 经营统计数据与订单数据一致
- [ ] `checkTimeout` 逻辑：超时订单被自动结束且费用按倍率计算

---

## S7：评价系统 + 在线客服

**依赖**：S6（管理端就绪，订单可完成）

**输入**：宪法第 1 章（评价+客服）、数据库 Schema（reviews + service_messages）、云函数签名

**输出文件清单：**
```
miniprogram/pages/review/
├── review.js / review.wxml / review.wxss / review.json
miniprogram/pages/service/
├── service.js / service.wxml / service.wxss / service.json
miniprogram/pages/admin/service/
├── service.js / service.wxml / service.wxss / service.json
components/star-rating/
├── star-rating.js / star-rating.wxml / star-rating.wxss / star-rating.json
cloudfunctions/submitReview/
├── index.js / config.json / package.json
cloudfunctions/sendServiceMessage/
├── index.js / config.json / package.json
cloudfunctions/getServiceMessages/
├── index.js / config.json / package.json
```

**任务描述：**

**评价 `pages/review/review`：**
1. 从订单详情"去评价"跳转，携带 `orderId`
2. 星级评分组件（`star-rating`）：5 颗星，支持半星（或简化为整星）
3. 文字评价输入框（选填，最多 200 字）
4. 图片上传（选填，最多 3 张，用 `wx.chooseImage` + 云存储）
5. 提交调用 `submitReview`，成功后跳回订单详情
6. 在门店详情页底部增加评价列表：显示最近 5 条 + "查看全部"
7. 每条评价：头像、昵称、星级、时间、内容、图片

**在线客服**
- **用户端 `pages/service/service`：**
  1. 类聊天界面：消息列表（自己消息右对齐、客服消息左对齐）
  2. 输入框 + 发送按钮 + 图片发送
  3. 进入页面时加载历史消息，新消息追加到列表
  4. 用 `watch` 或轮询方式监听新消息（云数据库 `watch` 实时监听）

- **管理端 `pages/admin/service/service`：**
  1. 会话列表：按用户分组显示最近消息
  2. 点击进入某用户会话：聊天界面同上
  3. 支持回复文本和图片

**云函数：**
- `submitReview`：验证订单归属 + 订单状态为 completed + 未评价过 → 写入 `reviews` 集合 → 返回评价
- `sendServiceMessage`：写入 `service_messages` → 返回消息记录
- `getServiceMessages`：按当前用户分页查询历史消息（用户端查自己，管理端查指定用户）

**验证标准：**
- [ ] 评价提交后门店详情评分更新
- [ ] 同一订单不可重复评价
- [ ] 客服消息实时收发（用户端 ↔ 管理端）
- [ ] 图片消息正常上传和展示

---

## S8：UI 打磨 + 公共组件 + 集成验证

**依赖**：S7（全部功能就绪）

**输入**：宪法第 5 章（UI 规范）、全局样式

**输出文件清单：**
```
components/store-card/
├── store-card.js / store-card.wxml / store-card.wxss / store-card.json
components/table-slot-picker/
├── table-slot-picker.js / table-slot-picker.wxml / table-slot-picker.wxss / table-slot-picker.json
miniprogram/app.wxss              # 更新：补充动画、微调
miniprogram/app.json              # 更新：注册全局组件
README.md                         # 最终版：完整部署说明
```

**任务描述：**

1. **`store-card` 组件**：抽取首页门店卡片为组件，供首页及其他列表复用
2. **`table-slot-picker` 组件**：将桌位时段选择器抽取为组件，`store` 页使用
3. **全局样式打磨**：
   - 统一卡片阴影 `box-shadow: 0 2px 8px rgba(0,0,0,0.08)`
   - 统一按钮样式（主按钮、次按钮、禁用态）
   - 添加页面切换动画、骨架屏加载态（简单 CSS 实现）
   - 下拉刷新样式统一
   - 空状态占位组件化（图标 + "暂无数据" + 引导文案）
4. **TabBar 图标**：使用自定义图标或微信默认图标，区分选中/未选中态
5. **端到端流程验证**：走一遍完整流程——
   - 登录 → 浏览门店 → 预约 → 支付 → 生成开门码 → 扫码开台 → 计时 → 结束结算 → 评价 → 客服咨询
   - 确保无报错、无 UI 错位
6. **README.md 终版**：
   - 完整部署步骤
   - 微信公众平台配置项（模板消息 ID 申请、权限配置）
   - 云开发控制台索引创建（`stores.location` geo 索引等）
   - 常见问题排查

**验证标准：**
- [ ] 组件抽取后功能与抽取前一致
- [ ] 骨架屏加载态完整
- [ ] 空状态在所有列表页正确展示
- [ ] 端到端全流程无报错
- [ ] `README.md` 部署步骤新手可跟做成功

---

**以上 8 个阶段全部完成后，项目即可在微信开发者工具中运行，核心业务流程完整可用。**
