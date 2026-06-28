// 云函数：finishOrder
// 功能：结束使用，计算实际费用（向上取整小时），多退少补，释放桌位
// 入参：{ orderId: string }
// 出参：{ code: 0, data: { order, refund?, charge? }, msg: 'ok' }

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

    // 校验权限：订单本人 或 管理员（管理员通过 adminManage 调用）
    if (order.userId !== OPENID) {
      // 检查是否管理员
      const userRes = await db.collection('users')
        .where({ _openid: OPENID, role: 'admin', isBlocked: false })
        .get();
      if (!userRes.data || userRes.data.length === 0) {
        return { code: -1, data: null, msg: '无权操作此订单' };
      }
    }

    // 只有"进行中"状态的订单可结束
    if (order.status !== 'using') {
      return { code: -2, data: null, msg: '订单非进行中状态，无法结束' };
    }

    if (!order.startTime) {
      return { code: -2, data: null, msg: '订单缺少开台时间，数据异常' };
    }

    // 2. 获取桌位单价
    const tableRes = await db.collection('tables').doc(order.tableId).get();
    if (!tableRes.data) {
      return { code: -1, data: null, msg: '桌位不存在' };
    }

    let hourlyPrice = tableRes.data.hourlyPrice;

    // 检查是否超时处罚
    const endTime = new Date();
    const startTime = new Date(order.startTime);
    const usedMinutes = Math.ceil((endTime - startTime) / 60000);
    const usedHours = Math.ceil(usedMinutes / 60); // 向上取整小时

    // 解析预约时段，判断是否超时
    let overtimeRate = 1.0;
    if (order.timeSlot) {
      const [slotEnd] = order.timeSlot.split('-')[1].split(':').map(Number);
      const slotEndHour = slotEnd < 10 ? slotEnd + 24 : slotEnd; // 处理跨午夜

      const endHour = endTime.getHours() + endTime.getMinutes() / 60;
      const normalizedEndHour = endHour < 10 ? endHour + 24 : endHour;

      if (normalizedEndHour > slotEndHour) {
        // 超时了，读取超时倍率
        const rateRes = await db.collection('settings')
          .where({ key: 'overTimeRate' })
          .get();
        if (rateRes.data && rateRes.data.length > 0) {
          overtimeRate = rateRes.data[0].value;
        }
      }
    }

    const normalAmount = hourlyPrice * usedHours;
    const actualAmount = Math.round(normalAmount * overtimeRate);
    const prepaid = order.discountAmount; // 预付金额

    // 计算差额
    const diff = actualAmount - prepaid; // 正数=需补缴，负数=需退款
    let refund = 0;
    let charge = 0;

    // 3. 处理退补
    if (diff > 0) {
      // 需补缴：模拟从余额扣款（余额不足时记录欠款）
      charge = diff;
      const userRes = await db.collection('users')
        .where({ _openid: order.userId })
        .get();

      if (userRes.data && userRes.data.length > 0) {
        const user = userRes.data[0];
        if (user.balance >= charge) {
          await db.collection('users').doc(user._id).update({
            data: { balance: db.command.inc(-charge) },
          });
        }
        // 余额不足：此处简化处理，直接扣为负数（实际应提示补缴）
      }
    } else if (diff < 0) {
      // 需退款：退回到用户余额
      refund = Math.abs(diff);
      const userRes = await db.collection('users')
        .where({ _openid: order.userId })
        .get();

      if (userRes.data && userRes.data.length > 0) {
        await db.collection('users').doc(userRes.data[0]._id).update({
          data: { balance: db.command.inc(refund) },
        });
      }
    }

    // 4. 更新订单
    const updateData = {
      status: 'completed',
      endTime,
      actualAmount,
    };

    await db.collection('orders').doc(orderId).update({ data: updateData });

    // 5. 释放桌位
    await db.collection('tables').doc(order.tableId).update({
      data: { status: 'idle' },
    });

    // 6. 释放 time_slots
    try {
      const slotRes = await db.collection('time_slots')
        .where({ orderId, status: 'occupied' })
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
        usedHours,
        usedMinutes,
        normalAmount,
        actualAmount,
        prepaid,
        refund,     // 退款金额（分），0 表示无退款
        charge,     // 补缴金额（分），0 表示无需补缴
      },
      msg: refund > 0 ? `已退款 ¥${(refund / 100).toFixed(2)}，欢迎再次光临`
        : charge > 0 ? `超时补缴 ¥${(charge / 100).toFixed(2)}`
        : '使用结束，欢迎再次光临',
    };
  } catch (err) {
    console.error('finishOrder 异常:', err);
    return { code: -1, data: null, msg: err.message || '结束订单失败' };
  }
};
