# 数据库初始化指南

## 一、集合创建

在微信开发者工具 → 云开发控制台 → 数据库，依次创建以下 9 个集合：

| 序号 | 集合名 | 用途 |
|------|--------|------|
| 1 | `users` | 用户信息 |
| 2 | `stores` | 门店信息 |
| 3 | `tables` | 桌位信息 |
| 4 | `time_slots` | 时段占用记录 |
| 5 | `orders` | 订单记录 |
| 6 | `reviews` | 用户评价 |
| 7 | `service_messages` | 客服消息 |
| 8 | `notifications` | 通知记录 |
| 9 | `settings` | 系统设置 |

## 二、安全规则配置

每个集合创建后，在"权限设置"中配置：

### users
```
仅创建者可读写
```
```json
{
  "read": "doc._openid == auth.openid",
  "write": "doc._openid == auth.openid"
}
```

### stores
```
所有人可读，仅管理员可写（由云函数控制写入权限）
```
```json
{
  "read": true,
  "write": false
}
```
> 写入操作通过 `adminManage` 云函数完成。

### tables
```json
{
  "read": true,
  "write": false
}
```

### time_slots
```json
{
  "read": true,
  "write": false
}
```
> `createOrder` / `verifyDoorCode` / `finishOrder` 等云函数负责更新时段状态。

### orders
```json
{
  "read": "doc._openid == auth.openid",
  "write": "doc._openid == auth.openid"
}
```
> 管理员操作（退款、强制结束）通过 `adminManage` 云函数绕过此规则。

### reviews
```json
{
  "read": true,
  "write": "doc._openid == auth.openid"
}
```
> 评价创建后不可修改（前端控制 + 云函数校验）。

### service_messages
```json
{
  "read": "doc._openid == auth.openid",
  "write": "doc._openid == auth.openid"
}
```

### notifications
```json
{
  "read": "doc._openid == auth.openid",
  "write": false
}
```
> 仅云函数可写入通知记录。

### settings
```json
{
  "read": false,
  "write": false
}
```
> 客户端直接读写均禁止，所有访问通过云函数。

## 三、索引创建

在云开发控制台 → 数据库 → 每个集合 → 索引管理，添加以下索引：

| 集合 | 索引字段 | 索引类型 | 说明 |
|------|---------|----------|------|
| `stores` | `location` | **地理位置索引** | `getNearbyStores` 云函数的 geoNear 查询依赖此索引。**必须手动创建**，否则近邻查询报错 |
| `orders` | `userId` | 普通索引（升序） | 用户订单列表查询 |
| `orders` | `status` | 普通索引（升序） | 订单状态筛选 |
| `orders` | `storeId` | 普通索引（升序） | 门店维度统计 |
| `reviews` | `storeId` | 普通索引（升序） | 门店评价列表 |
| `time_slots` | `tableId` + `date` | 组合索引 | 桌位日程查询 |
| `notifications` | `_openid` | 普通索引（升序） | 用户通知列表 |
| `service_messages` | `_openid` | 普通索引（升序） | 客服消息查询 |

> **重要**：`stores.location` 的地理位置索引是唯一必须手动创建的索引。其他索引为性能优化，可在数据量增大后逐步添加。

## 四、初始化执行

1. 确保 `initDatabase` 云函数已部署
2. 在云开发控制台 → 云函数 → `initDatabase` → 云端测试
3. 发送空参数 `{}`，点击"开始测试"
4. 返回结果中 `settings` 数组显示各配置项状态
5. 检查 `settings` 集合，应有 5 条记录

## 五、配置管理员

1. 在云开发控制台 → 数据库 → `settings` 集合
2. 找到 `key` 为 `adminOpenIds` 的记录
3. 编辑 `value` 字段，添加管理员的 openid（字符串数组）
4. 保存后，对应 openid 的用户在小程序中重新登录即可获得管理员权限

> 获取 openid：在小程序端调用 `getOpenId` 云函数，返回的 `user._openid` 即为当前用户 openid。
