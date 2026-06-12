// 云函数：adminManage
// 功能：管理端统一入口，通过 action 分发到不同处理函数
// 入参：{ action: string, payload: object }
// action 列表：
//   manageStore    - 门店增删改  { op:'add'|'update'|'delete', data }
//   manageTable    - 桌位增删改  { op, storeId?, data }
//   getUserList    - 用户列表    { page?, keyword? }
//   blockUser      - 拉黑/解封  { userId, isBlocked }
//   getOrderList   - 订单列表    { page?, storeId?, status? }
//   refundOrder    - 退款        { orderId }
//   forceFinish    - 强制结束    { orderId }
//   getStatistics  - 经营统计    { period:'today'|'week'|'month' }
//   updateSetting  - 修改设置    { key, value }
//   addAdmin       - 添加管理员  { openid }
// 出参：{ code: 0, data: ..., msg: 'ok' }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action, payload = {} } = event;

  // ========== 权限校验 ==========
  const isAdmin = await checkAdmin(OPENID);
  if (!isAdmin) {
    return { code: -403, data: null, msg: '无管理员权限' };
  }

  // ========== Action 路由 ==========
  try {
    switch (action) {
      case 'manageStore':
        return await manageStore(payload);
      case 'manageTable':
        return await manageTable(payload);
      case 'getUserList':
        return await getUserList(payload);
      case 'blockUser':
        return await blockUser(payload);
      case 'getOrderList':
        return await getOrderList(payload);
      case 'refundOrder':
        return await refundOrder(payload);
      case 'forceFinish':
        return await forceFinish(payload);
      case 'getStatistics':
        return await getStatistics(payload);
      case 'getSettings':
        return await getSettings();
      case 'updateSetting':
        return await updateSetting(payload);
      case 'addAdmin':
        return await addAdmin(payload);
      default:
        return { code: -1, data: null, msg: `未知 action: ${action}` };
    }
  } catch (err) {
    console.error(`adminManage [${action}] 异常:`, err);
    return { code: -1, data: null, msg: err.message || '操作失败' };
  }
};

// ========== 权限校验 ==========
async function checkAdmin(openid) {
  if (!openid) return false;
  try {
    const res = await db.collection('users')
      .where({ _openid: openid, role: 'admin', isBlocked: false })
      .get();
    return res.data && res.data.length > 0;
  } catch (e) {
    return false;
  }
}

// ========== 门店管理 ==========
async function manageStore({ op, data }) {
  if (op === 'add') {
    // 将客户端传来的 { lng, lat } 转换为服务端 Geo Point
    const storeData = { ...data };
    if (storeData.location && storeData.location.lng != null && storeData.location.lat != null) {
      storeData.location = db.Geo.Point(storeData.location.lng, storeData.location.lat);
    }
    storeData.status = 'open';
    storeData.createTime = new Date();

    const res = await db.collection('stores').add({ data: storeData });
    return { code: 0, data: { _id: res._id }, msg: '门店创建成功' };
  }

  if (op === 'update') {
    const { _id, ...updateData } = data;
    if (!_id) return { code: -1, data: null, msg: '缺少门店 _id' };
    // 同样处理 location
    if (updateData.location && updateData.location.lng != null && updateData.location.lat != null) {
      updateData.location = db.Geo.Point(updateData.location.lng, updateData.location.lat);
    }
    await db.collection('stores').doc(_id).update({ data: updateData });
    return { code: 0, data: null, msg: '门店更新成功' };
  }

  if (op === 'delete') {
    const { _id } = data;
    if (!_id) return { code: -1, data: null, msg: '缺少门店 _id' };
    // 软删除：标记为关闭
    await db.collection('stores').doc(_id).update({ data: { status: 'closed' } });
    return { code: 0, data: null, msg: '门店已关闭' };
  }

  return { code: -1, data: null, msg: `未知操作: ${op}` };
}

// ========== 桌位管理 ==========
async function manageTable({ op, data }) {
  if (op === 'add') {
    const res = await db.collection('tables').add({
      data: {
        ...data,
        status: 'idle',
        createTime: new Date(),
      },
    });
    // 更新门店桌位数
    if (data.storeId) {
      await db.collection('stores').doc(data.storeId).update({
        data: { tablesCount: _.inc(1) },
      });
    }
    return { code: 0, data: { _id: res._id }, msg: '桌位创建成功' };
  }

  if (op === 'update') {
    const { _id, ...updateData } = data;
    if (!_id) return { code: -1, data: null, msg: '缺少桌位 _id' };
    await db.collection('tables').doc(_id).update({ data: updateData });
    return { code: 0, data: null, msg: '桌位更新成功' };
  }

  if (op === 'delete') {
    const { _id, storeId } = data;
    if (!_id) return { code: -1, data: null, msg: '缺少桌位 _id' };
    await db.collection('tables').doc(_id).remove();
    if (storeId) {
      await db.collection('stores').doc(storeId).update({
        data: { tablesCount: _.inc(-1) },
      });
    }
    return { code: 0, data: null, msg: '桌位已删除' };
  }

  return { code: -1, data: null, msg: `未知操作: ${op}` };
}

// ========== 用户列表 ==========
async function getUserList({ page = 1, keyword = '' }) {
  const pageSize = 20;
  let query = db.collection('users').orderBy('createTime', 'desc');

  if (keyword) {
    query = query.where(
      _.or([
        { nickName: db.RegExp({ regexp: keyword, options: 'i' }) },
        { phone: db.RegExp({ regexp: keyword, options: 'i' }) },
      ])
    );
  }

  const res = await query.skip((page - 1) * pageSize).limit(pageSize).get();

  return {
    code: 0,
    data: { users: res.data, page, hasMore: res.data.length >= pageSize },
    msg: 'ok',
  };
}

// ========== 拉黑/解封 ==========
async function blockUser({ userId, isBlocked }) {
  if (!userId) return { code: -1, data: null, msg: '缺少 userId' };
  await db.collection('users').doc(userId).update({ data: { isBlocked } });
  return { code: 0, data: null, msg: isBlocked ? '用户已拉黑' : '用户已解封' };
}

// ========== 订单列表 ==========
async function getOrderList({ page = 1, storeId, status }) {
  const pageSize = 20;
  const where = {};
  if (storeId) where.storeId = storeId;
  if (status) where.status = status;

  const res = await db.collection('orders')
    .where(where)
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  return {
    code: 0,
    data: { orders: res.data, page, hasMore: res.data.length >= pageSize },
    msg: 'ok',
  };
}

// ========== 退款 ==========
async function refundOrder({ orderId }) {
  if (!orderId) return { code: -1, data: null, msg: '缺少 orderId' };

  const orderRes = await db.collection('orders').doc(orderId).get();
  if (!orderRes.data) return { code: -1, data: null, msg: '订单不存在' };

  const order = orderRes.data;
  if (order.status === 'cancelled') {
    return { code: -2, data: null, msg: '订单已取消，无需重复退款' };
  }

  // 仅已支付订单退款到用户余额
  if (order.status === 'paid') {
    const refundAmount = order.discountAmount;
    const userQuery = await db.collection('users').where({ _openid: order.userId }).get();
    if (userQuery.data && userQuery.data.length > 0) {
      await db.collection('users').doc(userQuery.data[0]._id).update({
        data: { balance: _.inc(refundAmount) },
      });
    }
  }

  // 更新订单
  await db.collection('orders').doc(orderId).update({
    data: { status: 'cancelled', endTime: new Date() },
  });

  // 释放时段
  try {
    const slots = await db.collection('time_slots').where({ orderId }).get();
    if (slots.data && slots.data.length > 0) {
      await db.collection('time_slots').doc(slots.data[0]._id).update({
        data: { status: 'free', orderId: null },
      });
    }
  } catch (e) { /* ignore */ }

  // 释放桌位（如果是使用中）
  if (order.status === 'using') {
    await db.collection('tables').doc(order.tableId).update({
      data: { status: 'idle' },
    });
  }

  return { code: 0, data: null, msg: '退款成功' };
}

// ========== 强制结束 ==========
async function forceFinish({ orderId }) {
  if (!orderId) return { code: -1, data: null, msg: '缺少 orderId' };

  const orderRes = await db.collection('orders').doc(orderId).get();
  if (!orderRes.data) return { code: -1, data: null, msg: '订单不存在' };

  const order = orderRes.data;
  if (order.status !== 'using') {
    return { code: -1, data: null, msg: '仅进行中的订单可强制结束' };
  }

  const endTime = new Date();
  const startTime = new Date(order.startTime);
  const usedMinutes = Math.ceil((endTime - startTime) / 60000);
  const usedHours = Math.ceil(usedMinutes / 60);

  // 获取单价
  let hourlyPrice = 100;
  try {
    const tableRes = await db.collection('tables').doc(order.tableId).get();
    if (tableRes.data) hourlyPrice = tableRes.data.hourlyPrice;
  } catch (e) { /* ignore */ }

  const actualAmount = hourlyPrice * usedHours;

  await db.collection('orders').doc(orderId).update({
    data: { status: 'completed', endTime, actualAmount },
  });

  await db.collection('tables').doc(order.tableId).update({
    data: { status: 'idle' },
  });

  try {
    const slots = await db.collection('time_slots').where({ orderId, status: 'occupied' }).get();
    if (slots.data && slots.data.length > 0) {
      await db.collection('time_slots').doc(slots.data[0]._id).update({
        data: { status: 'free', orderId: null },
      });
    }
  } catch (e) { /* ignore */ }

  return { code: 0, data: { usedHours, actualAmount }, msg: '已强制结束' };
}

// ========== 经营统计 ==========
async function getStatistics({ period = 'today' }) {
  // 计算时间范围
  const now = new Date();
  let startDate;
  if (period === 'today') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === 'week') {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 7);
  } else if (period === 'month') {
    startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - 1);
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  // 查询已完成订单
  const ordersRes = await db.collection('orders')
    .where({
      status: 'completed',
      createTime: _.gte(startDate),
    })
    .get();

  const orders = ordersRes.data;
  const totalRevenue = orders.reduce((sum, o) => sum + (o.actualAmount || o.discountAmount || 0), 0);
  const totalOrders = orders.length;

  // 今日进行中/已支付
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const activeRes = await db.collection('orders')
    .where({
      status: _.in(['paid', 'using']),
      createTime: _.gte(todayStart),
    })
    .count();

  // 门店使用率
  const storesRes = await db.collection('stores').where({ status: 'open' }).get();
  let totalTables = 0;
  let inUseTables = 0;
  for (const store of storesRes.data) {
    const tablesRes = await db.collection('tables').where({ storeId: store._id }).get();
    totalTables += tablesRes.data.length;
    inUseTables += tablesRes.data.filter(t => t.status === 'in_use').length;
  }

  return {
    code: 0,
    data: {
      period,
      totalRevenue,       // 分
      totalOrders,
      activeOrders: activeRes.total,
      totalTables,
      inUseTables,
      utilizationRate: totalTables > 0
        ? Math.round((inUseTables / totalTables) * 100)
        : 0,
    },
    msg: 'ok',
  };
}

// ========== 获取系统设置 ==========
async function getSettings() {
  const res = await db.collection('settings').get();
  return { code: 0, data: res.data || [], msg: 'ok' };
}

// ========== 修改系统设置 ==========
async function updateSetting({ key, value }) {
  if (!key) return { code: -1, data: null, msg: '缺少设置 key' };

  const exist = await db.collection('settings').where({ key }).get();
  if (exist.data && exist.data.length > 0) {
    await db.collection('settings').doc(exist.data[0]._id).update({
      data: { value },
    });
  } else {
    await db.collection('settings').add({ data: { key, value } });
  }

  return { code: 0, data: null, msg: '设置已更新' };
}

// ========== 添加管理员 ==========
async function addAdmin({ openid }) {
  if (!openid) return { code: -1, data: null, msg: '缺少 openid' };

  // 更新 users 表
  const userRes = await db.collection('users').where({ _openid: openid }).get();
  if (userRes.data && userRes.data.length > 0) {
    await db.collection('users').doc(userRes.data[0]._id).update({
      data: { role: 'admin' },
    });
  }

  // 同步更新 settings 中的 adminOpenIds
  const settingRes = await db.collection('settings').where({ key: 'adminOpenIds' }).get();
  if (settingRes.data && settingRes.data.length > 0) {
    const ids = settingRes.data[0].value || [];
    if (!ids.includes(openid)) {
      ids.push(openid);
      await db.collection('settings').doc(settingRes.data[0]._id).update({
        data: { value: ids },
      });
    }
  }

  return { code: 0, data: null, msg: '管理员添加成功' };
}
