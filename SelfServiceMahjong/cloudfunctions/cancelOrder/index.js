// 云函数：cancelOrder
// 功能：取消订单（待支付直接取消；已支付未开台则退款到余额后取消）
// 入参：{ orderId: string }
// 出参：{ code: 0, data: { order }, msg: 'ok' }
// 错误码：-1 系统错误, -2 订单状态不允许取消

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { orderId } = event;

  if (!orderId) {
    return { code: -1, data: null, msg: '缺少订单 ID' };
  }

  try {
    // 1. 查询订单
    const orderRes = await db.collection('orders').doc(orderId).get();
    if (!orderRes.data) {
      return { code: -1, data: null, msg: '订单不存在' };
    }

    const order = orderRes.data;

    // 校验归属
    if (order.userId !== OPENID) {
      return { code: -1, data: null, msg: '无权操作此订单' };
    }

    // 2. 状态判断
    const cancellableStatuses = ['pending', 'paid'];

    if (!cancellableStatuses.includes(order.status)) {
      const statusMap = {
        using: '订单进行中，请先结束使用',
        completed: '订单已完成，无法取消',
        cancelled: '订单已取消',
      };
      return {
        code: -2,
        data: null,
        msg: statusMap[order.status] || '订单状态不允许取消',
      };
    }

    const isPaid = order.status === 'paid';

    // 3. 执行取消
    if (isPaid) {
      // 已支付订单：退款到余额
      const refundAmount = order.discountAmount;

      const userRes = await db.collection('users')
        .where({ _openid: OPENID })
        .get();

      if (userRes.data && userRes.data.length > 0) {
        await db.collection('users').doc(userRes.data[0]._id).update({
          data: { balance: db.command.inc(refundAmount) },
        });
      }
    }

    // 更新订单状态
    await db.collection('orders').doc(orderId).update({
      data: {
        status: 'cancelled',
        endTime: new Date(), // 用于记录取消时间
      },
    });

    // 4. 释放锁定的时段
    try {
      const slotRes = await db.collection('time_slots')
        .where({ orderId, status: 'booked' })
        .get();

      if (slotRes.data && slotRes.data.length > 0) {
        await db.collection('time_slots').doc(slotRes.data[0]._id).update({
          data: { status: 'free', orderId: null },
        });
      }
    } catch (err) {
      console.warn('释放 time_slots 失败, 忽略:', err.message);
    }

    // 返回结果
    const updatedOrder = await db.collection('orders').doc(orderId).get();

    return {
      code: 0,
      data: {
        order: updatedOrder.data,
        refunded: isPaid,
        refundAmount: isPaid ? order.discountAmount : 0,
      },
      msg: isPaid ? '订单已取消，款项已退回余额' : '订单已取消',
    };
  } catch (err) {
    console.error('cancelOrder 异常:', err);
    return { code: -1, data: null, msg: err.message || '取消订单失败' };
  }
};
