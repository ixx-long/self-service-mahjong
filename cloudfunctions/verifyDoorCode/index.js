// 云函数：verifyDoorCode
// 功能：验证开门码（扫码开台），检查签名 + 时效 + 订单状态，成功后开台
// 入参：{ doorCode: string } —— 即扫码得到的 "orderId|timestamp|sign"
// 出参：{ code: 0, data: { order }, msg: 'ok' }
// 错误码：-1 系统错误, -2 开门码无效, -3 开门码已过期, -4 订单状态异常

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { doorCode } = event;

  if (!doorCode) {
    return { code: -1, data: null, msg: '缺少开门码参数' };
  }

  try {
    // 1. 解析开门码
    const parts = doorCode.split('|');
    if (parts.length !== 3) {
      return { code: -2, data: null, msg: '开门码格式无效' };
    }

    const [orderId, timestampStr, sign] = parts;
    const timestamp = parseInt(timestampStr);
    if (!orderId || !timestamp || !sign || isNaN(timestamp)) {
      return { code: -2, data: null, msg: '开门码数据无效' };
    }

    // 2. 获取签名密钥
    const secretRes = await db.collection('settings')
      .where({ key: 'doorCodeSecret' })
      .get();

    if (!secretRes.data || secretRes.data.length === 0) {
      return { code: -1, data: null, msg: '系统配置缺失' };
    }

    const secret = secretRes.data[0].value;

    // 3. 验证签名
    const crypto = require('crypto');
    const rawStr = `${orderId}|${timestamp}|${secret}`;
    const computedSign = crypto.createHash('sha256').update(rawStr).digest('hex');

    if (computedSign !== sign) {
      return { code: -2, data: null, msg: '开门码签名验证失败' };
    }

    // 4. 检查时效（5 分钟）
    const now = Date.now();
    if (now - timestamp > 5 * 60 * 1000) {
      return { code: -3, data: null, msg: '开门码已过期（有效期为 5 分钟）' };
    }

    // 5. 查询订单
    const orderRes = await db.collection('orders').doc(orderId).get();
    if (!orderRes.data) {
      return { code: -1, data: null, msg: '订单不存在' };
    }

    const order = orderRes.data;

    // 检查订单状态
    if (order.status !== 'paid') {
      if (order.status === 'using') {
        return { code: -4, data: null, msg: '该订单已开台，请勿重复扫码' };
      }
      if (order.status === 'completed') {
        return { code: -4, data: null, msg: '该订单已完成' };
      }
      if (order.status === 'cancelled') {
        return { code: -4, data: null, msg: '该订单已取消' };
      }
      return { code: -4, data: null, msg: '订单状态异常，无法开台' };
    }

    // 6. 开台：更新订单状态
    const startTime = new Date();
    await db.collection('orders').doc(orderId).update({
      data: {
        status: 'using',
        startTime,
      },
    });

    // 7. 更新桌位状态
    await db.collection('tables').doc(order.tableId).update({
      data: { status: 'in_use' },
    });

    // 8. 更新 time_slots 状态
    try {
      const slotRes = await db.collection('time_slots')
        .where({
          orderId,
          status: 'booked',
        })
        .get();

      if (slotRes.data && slotRes.data.length > 0) {
        await db.collection('time_slots').doc(slotRes.data[0]._id).update({
          data: { status: 'occupied' },
        });
      }
    } catch (err) {
      console.warn('更新 time_slots 状态失败, 忽略:', err.message);
    }

    // 9. 记录扫码日志
    await db.collection('scan_records').add({
      data: {
        orderId,
        scannerUserId: OPENID, // 扫码者 openid（可能是管理员）
        scanTime: startTime,
        result: 'success',
      },
    });

    // 返回更新后的订单
    const updatedOrder = await db.collection('orders').doc(orderId).get();

    return {
      code: 0,
      data: { order: updatedOrder.data },
      msg: '开台成功',
    };
  } catch (err) {
    console.error('verifyDoorCode 异常:', err);
    return { code: -1, data: null, msg: err.message || '验证开门码失败' };
  }
};
