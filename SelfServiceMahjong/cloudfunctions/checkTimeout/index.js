// 云函数：checkTimeout（定时触发器）
// 功能：每 5 分钟触发，检查使用中的订单是否超时，自动结算或发送预警
// 入参：无（定时触发器自动调用）
// 出参：{ code: 0, data: { processed, details[] }, msg: 'ok' }
// 触发器配置：config.json → triggers → 0 */5 * * * * *

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  console.log('checkTimeout 定时触发:', new Date().toISOString());

  const details = [];
  let processed = 0;

  try {
    // 1. 查询所有"进行中"的订单
    const usingOrders = await db.collection('orders')
      .where({ status: 'using' })
      .get();

    if (!usingOrders.data || usingOrders.data.length === 0) {
      console.log('无进行中订单');
      return { code: 0, data: { processed: 0, details: [] }, msg: '无进行中订单' };
    }

    console.log(`发现 ${usingOrders.data.length} 个进行中订单`);

    // 2. 获取超时倍率
    let overtimeRate = 1.5;
    try {
      const rateRes = await db.collection('settings').where({ key: 'overTimeRate' }).get();
      if (rateRes.data && rateRes.data.length > 0) {
        overtimeRate = rateRes.data[0].value;
      }
    } catch (e) { /* ignore */ }

    const now = new Date();

    for (const order of usingOrders.data) {
      try {
        // 3. 解析预约时段结束时间
        if (!order.timeSlot || !order.startTime) continue;

        const slotEnd = parseSlotEnd(order.timeSlot, order.date);
        const startTime = new Date(order.startTime);
        const usedMinutes = Math.ceil((now - startTime) / 60000);

        // 4. 判断是否超时
        const remainingMinutes = Math.ceil((slotEnd - now) / 60000);

        if (remainingMinutes <= -5) {
          // 已超时超过 5 分钟：自动结束订单
          console.log(`订单 ${order._id} 严重超时，自动结束`);

          const usedHours = Math.ceil(usedMinutes / 60);
          let hourlyPrice = 100;
          try {
            const tableRes = await db.collection('tables').doc(order.tableId).get();
            if (tableRes.data) hourlyPrice = tableRes.data.hourlyPrice;
          } catch (e) { /* ignore */ }

          // 按时段内和超时分别计算
          const slotHours = calcSlotHours(order.timeSlot);
          const normalAmount = hourlyPrice * slotHours;
          const overtimeHours = Math.max(0, usedHours - slotHours);
          const overtimeAmount = Math.round(hourlyPrice * overtimeRate * overtimeHours);
          const actualAmount = normalAmount + overtimeAmount;
          const prepaid = order.discountAmount;

          // 处理退补（简化：直接记录，不实际扣款）
          const diff = actualAmount - prepaid;

          await db.collection('orders').doc(order._id).update({
            data: {
              status: 'completed',
              endTime: now,
              actualAmount,
            },
          });

          // 释放桌位
          await db.collection('tables').doc(order.tableId).update({
            data: { status: 'idle' },
          });

          // 释放时段
          try {
            const slots = await db.collection('time_slots')
              .where({ orderId: order._id, status: 'occupied' })
              .get();
            if (slots.data && slots.data.length > 0) {
              await db.collection('time_slots').doc(slots.data[0]._id).update({
                data: { status: 'free', orderId: null },
              });
            }
          } catch (e) { /* ignore */ }

          // 发送超时完成通知
          try {
            await cloud.callFunction({
              name: 'sendSubscribeMessage',
              data: { type: 'complete', orderId: order._id },
            });
          } catch (e) { /* ignore */ }

          details.push({
            orderId: order._id,
            action: 'auto_completed',
            usedMinutes,
            actualAmount,
            diff,
          });
          processed++;

        } else if (remainingMinutes <= 5 && remainingMinutes > -5) {
          // 剩余 5 分钟内或刚超时：发送预警通知
          console.log(`订单 ${order._id} 即将超时，剩余 ${remainingMinutes} 分钟，发送预警`);

          try {
            await cloud.callFunction({
              name: 'sendSubscribeMessage',
              data: { type: 'timeout_warning', orderId: order._id },
            });
          } catch (e) { /* ignore */ }

          details.push({
            orderId: order._id,
            action: 'warned',
            remainingMinutes,
          });
          processed++;
        }
      } catch (err) {
        console.error(`处理订单 ${order._id} 失败:`, err);
        details.push({
          orderId: order._id,
          action: 'error',
          error: err.message,
        });
      }
    }

    console.log(`checkTimeout 完成: 处理 ${processed} 个订单`);
    return { code: 0, data: { processed, details }, msg: 'ok' };
  } catch (err) {
    console.error('checkTimeout 异常:', err);
    return { code: -1, data: null, msg: err.message || '定时检查失败' };
  }
};

/** 解析时段结束时间为 Date 对象 */
function parseSlotEnd(timeSlot, dateStr) {
  const endTime = timeSlot.split('-')[1]; // "14:00"
  const [h, m] = endTime.split(':').map(Number);
  const d = new Date(dateStr);
  d.setHours(h, m, 0, 0);
  // 处理跨午夜：如果结束时间早于 8:00，加一天
  if (h < 8) d.setDate(d.getDate() + 1);
  return d;
}

/** 计算时段小时数 */
function calcSlotHours(slot) {
  const [start, end] = slot.split('-');
  const [h1, m1] = start.split(':').map(Number);
  const [h2, m2] = end.split(':').map(Number);
  let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (diff <= 0) diff += 24 * 60;
  return Math.ceil(diff / 60);
}
