# 自助麻将馆 - SelfServiceMahjong

基于微信小程序原生 + 微信云开发（传统模式）的自助麻将馆系统。

**设计语言**：现代东方奢华 — 鎏金 × 檀木红 × 暖白底

## 功能全景

| 模块 | 功能 |
|------|------|
| **用户端** | 附近门店 → 桌位时段预约 → 在线支付 → 动态开门码 → 扫码开台 → 实时计时计费 → 结算评价 |
| **管理端** | 仪表盘统计 → 门店/桌位/定价管理 → 订单管理（退款/强制结束）→ 用户管理（拉黑）→ 系统设置 |
| **增值功能** | 微信订阅消息通知、订单评价系统（星级+图片）、在线客服（用户端+管理端双向） |

## 技术栈

- 前端：微信小程序原生（WXML + WXSS + JS）
- 后端：微信云开发传统模式（云数据库 + 云函数 + 云存储）
- 支付：模拟支付（上线前替换为微信支付接口）
- 开门码：SHA256 签名，5 分钟有效

## 项目结构

```
SelfServiceMahjong/
├── project.config.json              # 项目配置
├── README.md                        # 本文件
├── miniprogram/                     # 小程序前端
│   ├── app.js / app.json / app.wxss # 入口文件
│   ├── pages/                       # 页面
│   │   ├── index/                   # 首页（门店列表）
│   │   ├── store/                   # 门店详情 + 桌位选择
│   │   ├── confirm/                 # 确认预约
│   │   ├── orders/                  # 我的订单
│   │   ├── orderDetail/             # 订单详情（开门码+计时）
│   │   ├── mine/                    # 个人中心
│   │   ├── review/                  # 写评价
│   │   ├── service/                 # 在线客服
│   │   └── admin/                   # 管理端
│   │       ├── dashboard/           # 仪表盘
│   │       ├── stores/              # 门店管理
│   │       ├── tables/              # 桌位管理
│   │       ├── orders/              # 订单管理
│   │       ├── users/               # 用户管理
│   │       ├── service/             # 客服回复
│   │       └── settings/            # 系统设置
│   ├── components/                  # 公共组件
│   │   ├── store-card/              # 门店卡片
│   │   ├── table-slot-picker/       # 桌位时段选择器
│   │   └── star-rating/             # 星级评分
│   ├── utils/                       # 工具函数
│   │   ├── util.js                  # 通用工具
│   │   └── cloud.js                 # 云开发封装
│   ├── database/db_init.md          # 数据库安全规则
│   └── images/                      # 图标资源
└── cloudfunctions/                  # 云函数（15个）
    ├── getOpenId/                   # 登录
    ├── getNearbyStores/             # 附近门店
    ├── getStoreDetail/              # 门店详情
    ├── createOrder/                 # 创建订单
    ├── payOrder/                    # 模拟支付
    ├── generateDoorCode/            # 生成开门码
    ├── verifyDoorCode/              # 验证开门码
    ├── finishOrder/                 # 结束使用
    ├── cancelOrder/                 # 取消订单
    ├── submitReview/                # 提交评价
    ├── sendServiceMessage/          # 发送客服消息
    ├── getServiceMessages/          # 获取客服消息
    ├── sendSubscribeMessage/        # 订阅消息通知
    ├── adminManage/                 # 管理端统一入口
    ├── checkTimeout/                # 定时触发器
    └── initDatabase/                # 数据库初始化
```

## 快速启动

### 1. 准备工作

- 注册微信小程序账号（获取 AppID）
- 开通微信云开发（小程序管理后台 → 开发 → 云开发）
- 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)

### 2. 导入项目

1. 微信开发者工具 → 导入项目
2. 目录选择 `SelfServiceMahjong/` 根目录
3. AppID 填写你的小程序 AppID
4. 勾选"使用云开发"

### 3. 配置云环境

1. 打开 `miniprogram/app.js`，将 `env: 'your-env-id'` 替换为云开发环境 ID
2. 在开发者工具中点击"云开发"进入控制台

### 4. 部署云函数

在开发者工具中，对 `cloudfunctions/` 下的每个云函数右键 → "上传并部署：云端安装依赖"。

推荐部署顺序：`getOpenId` → `initDatabase` → 其余全部。

### 5. 创建数据库集合

云开发控制台 → 数据库 → 新建集合（共 9 个）：

```
users, stores, tables, time_slots, orders,
reviews, service_messages, notifications, settings
```

### 6. 配置安全规则

详见 `miniprogram/database/db_init.md`。

快速配置：
- `users`、`orders`、`reviews`、`service_messages`、`notifications` → "仅创建者可读写"
- `stores`、`tables`、`time_slots` → "所有人可读，仅创建者可写"（写入由云函数完成）
- `settings` → 所有权限关闭（仅云函数访问）

### 7. 创建索引

云开发控制台 → 数据库 → 每个集合 → 索引管理：

| 集合 | 索引 | 类型 |
|------|------|------|
| `stores` | `location` | **地理位置索引**（必须） |
| `orders` | `userId` + `status` | 普通索引 |
| `orders` | `storeId` | 普通索引 |
| `time_slots` | `tableId` + `date` | 组合索引 |
| `reviews` | `storeId` | 普通索引 |

> `stores.location` 地理位置索引是 **getNearbyStores 云函数的必要条件**。

### 8. 初始化数据

1. 云开发控制台 → 云函数 → `initDatabase` → 云端测试
2. 发送空参数 `{}`，执行
3. 检查 `settings` 集合应有 5 条初始记录

### 9. 设置管理员

1. 在小程序中调用 `getOpenId` 获取你的 openid
2. 云开发控制台 → 数据库 → `settings`
3. 找到 `key` 为 `adminOpenIds` 的记录，将 openid 加入 `value` 数组
4. 重新进入小程序"我的"页面即可看到管理端入口

### 10. 配置定时触发器

云开发控制台 → 触发器 → 新建触发器：
- 云函数：`checkTimeout`
- 触发周期：每 5 分钟
- Cron：`0 */5 * * * * *`

## 订阅消息模板

在微信公众平台 → 小程序后台 → 功能 → 订阅消息，申请以下模板：

| 模板 | 用途 | 代码中占位符 |
|------|------|-------------|
| 支付成功通知 | 支付后确认 | `TEMPLATE_ID_PAY_SUCCESS` |
| 开台提醒 | 扫码开台后 | `TEMPLATE_ID_START_USE` |
| 超时预警 | 超时前 10 分钟 | `TEMPLATE_ID_TIMEOUT_WARNING` |
| 消费完成 | 结算完成 | `TEMPLATE_ID_COMPLETE` |

在 `sendSubscribeMessage` 云函数中替换占位符。

## 注意事项

- **支付为模拟实现**，上线前需接入微信支付 + 支付回调
- TabBar 图标需准备 6 张 40×40px PNG（见 `miniprogram/images/README.md`）
- 开门码签名密钥存储在 `settings.doorCodeSecret`，初始化时随机生成
- 用户端和管理端在同一小程序，通过 `role` 字段区分
- `checkTimeout` 定时触发器按超时费率自动结算超时订单
