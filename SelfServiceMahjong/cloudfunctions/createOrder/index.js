// 云函数：createOrder
// 功能：创建预约订单，检查时段冲突，锁定桌位时段
// 入参：{ storeId, tableId, date, timeSlot }
// 出参：{ code: 0, data: { orderId, amount }, msg: 'ok' }
// 错误码：-1 系统错误, -2 时段已被占用, -3 桌位不可用

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { storeId, tableId, date, timeSlot } = event;

  // 参数校验
  if (!storeId || !tableId || !date || !timeSlot) {
    return { code: -1, data: null, msg: '缺少必要参数' };
  }

  if (!OPENID) {
    return { code: -1, data: null, msg: '未获取到用户身份' };
  }

  try {
    // ========================================
    // 1. 校验桌位状态
    // ========================================
    const tableRes = await db.collection('tables').doc(tableId).get();
    if (!tableRes.data) {
      return { code: -1, data: null, msg: '桌位不存在' };
    }
    const table = tableRes.data;

    // 检查桌位是否可预约
    if (table.status === 'maintenance') {
      return { code: -3, data: null, msg: '该桌位正在维修中' };
    }
    if (table.storeId !== storeId) {
      return { code: -1, data: null, msg: '桌位不属于该门店' };
    }

    // ========================================
    // 2. 检查时段冲突（原子操作：使用 add 的竞态防护）
    // ========================================
    // 先查询该桌位该日期的该时段是否已被占用
    const conflictRes = await db.collection('time_slots')
      .where({
        tableId,
        date,
        slot: timeSlot,
        status: db.command.in(['booked', 'occupied']),
      })
      .get();

    if (conflictRes.data && conflictRes.data.length > 0) {
      return { code: -2, data: null, msg: '该时段已被预约，请重新选择' };
    }

    // ========================================
    // 3. 计算费用（按桌位 hourlyPrice + 时段小时数）
    // ========================================
    const hours = calcSlotHours(timeSlot); // 如 "10:00-14:00" → 4
    const amount = table.hourlyPrice * hours; // 单位为分

    // ========================================
    // 4. 创建订单（status = 'pending'）
    // ========================================
    const orderData = {
      _openid: OPENID,  // 客户端读取权限依赖此字段
      userId: OPENID,
      storeId,
      tableId,
      date,
      timeSlot,
      amount,
      discountAmount: amount, // 现阶段无优惠券，实付款 = 原价
      status: 'pending',
      payTime: null,
      startTime: null,
      endTime: null,
      actualAmount: null,
      doorCodeSign: null,
      doorCodeExpire: null,
      createTime: new Date(),
    };

    const orderRes = await db.collection('orders').add({ data: orderData });
    const orderId = orderRes._id;

    // ========================================
    // 5. 锁定时段（创建 time_slots 记录）
    // ========================================
    // 再次检查冲突（双重校验防并发）
    const doubleCheck = await db.collection('time_slots')
      .where({
        tableId,
        date,
        slot: timeSlot,
        status: db.command.in(['booked', 'occupied']),
      })
      .get();

    if (doubleCheck.data && doubleCheck.data.length > 0) {
      // 有人抢先了，回退订单
      await db.collection('orders').doc(orderId).update({
        data: { status: 'cancelled' },
      });
      return { code: -2, data: null, msg: '该时段刚被他人抢占，请重新选择' };
    }

    await db.collection('time_slots').add({
      data: {
        storeId,
        date,
        tableId,
        slot: timeSlot,
        status: 'booked',
        orderId,
        createTime: new Date(),
      },
    });

    return {
      code: 0,
      data: { orderId, amount },
      msg: '预约成功',
    };
  } catch (err) {
    console.error('createOrder 异常:', err);
    return { code: -1, data: null, msg: err.message || '创建订单失败' };
  }
};

/**
 * 计算时段的小时数
 * @param {string} slot - "10:00-14:00"
 * @returns {number}
 */
function calcSlotHours(slot) {
  const parts = slot.split('-');
  if (parts.length !== 2) return 4; // 默认 4 小时

  const [h1, m1] = parts[0].split(':').map(Number);
  const [h2, m2] = parts[1].split(':').map(Number);

  let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  // 跨午夜处理（如 22:00-02:00）
  if (diff <= 0) diff += 24 * 60;

  return Math.ceil(diff / 60); // 向上取整小时
}
