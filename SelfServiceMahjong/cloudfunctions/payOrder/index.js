// 云函数：payOrder
// 功能：模拟支付，从用户余额扣款，变更订单状态为已支付
// 入参：{ orderId: string }
// 出参：{ code: 0, data: { order }, msg: 'ok' }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { orderId } = event;

  if (!orderId) {
    return { code: -1, data: null, msg: '缺少订单 ID' };
  }

  if (!OPENID) {
    return { code: -1, data: null, msg: '未获取到用户身份' };
  }

  try {
    // 1. 查询订单
    const orderRes = await db.collection('orders').doc(orderId).get();
    if (!orderRes.data) {
      return { code: -1, data: null, msg: '订单不存在' };
    }

    const order = orderRes.data;

    // 校验订单归属
    if (order.userId !== OPENID) {
      return { code: -1, data: null, msg: '无权操作此订单' };
    }

    // 只有待支付状态的订单可以支付
    if (order.status !== 'pending') {
      return { code: -2, data: null, msg: '订单状态不允许支付' };
    }

    // 2. 查询用户余额
    const userRes = await db.collection('users').where({ _openid: OPENID }).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { code: -1, data: null, msg: '用户不存在' };
    }

    const user = userRes.data[0];
    const payAmount = order.discountAmount || order.amount || 0;

    if (user.balance < payAmount) {
      return { code: -3, data: null, msg: `余额不足，需 ¥${(payAmount / 100).toFixed(2)}，当前 ¥${(user.balance / 100).toFixed(2)}` };
    }

    // 3. 扣款 + 更新订单状态
    await db.collection('users').doc(user._id).update({
      data: { balance: _.inc(-payAmount) },
    });

    const now = new Date();
    await db.collection('orders').doc(orderId).update({
      data: {
        status: 'paid',
        payTime: now,
      },
    });

    // 4. 返回更新后的订单
    const updatedOrder = await db.collection('orders').doc(orderId).get();

    return {
      code: 0,
      data: { order: updatedOrder.data, payAmount },
      msg: '支付成功',
    };
  } catch (err) {
    console.error('payOrder 异常:', err);
    return { code: -1, data: null, msg: err.message || '支付失败' };
  }
};
