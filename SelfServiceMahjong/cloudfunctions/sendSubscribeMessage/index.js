// 云函数：sendSubscribeMessage
// 功能：发送微信订阅消息通知
// 入参：{ type: 'pay_success'|'start_use'|'timeout_warning'|'complete', orderId: string }
// 出参：{ code: 0, data: { success }, msg: 'ok' }
// 依赖：需在微信公众平台申请订阅消息模板，替换下方 TEMPLATE_ID 占位符

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 模板 ID 映射（上线前替换为真实模板 ID）
const TEMPLATE_IDS = {
  pay_success: 'TEMPLATE_ID_PAY_SUCCESS',       // 支付成功通知
  start_use: 'TEMPLATE_ID_START_USE',            // 开台提醒
  timeout_warning: 'TEMPLATE_ID_TIMEOUT_WARNING', // 超时预警
  complete: 'TEMPLATE_ID_COMPLETE',              // 消费完成通知
};

// 各类型通知的模板字段映射
const TEMPLATE_DATA_MAP = {
  pay_success: (order, store) => ({
    thing1: { value: store.name || '麻将馆' },
    amount2: { value: `¥${(order.discountAmount / 100).toFixed(2)}` },
    date3: { value: order.date },
    thing4: { value: order.timeSlot },
  }),
  start_use: (order, store) => ({
    thing1: { value: store.name || '麻将馆' },
    time2: { value: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) },
    thing3: { value: `桌位已开台，祝您玩得愉快` },
  }),
  timeout_warning: (order, store) => ({
    thing1: { value: `您的使用时间即将超时` },
    time2: { value: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) },
    thing3: { value: `超时后将按 ${store.name || '门店'} 的超时费率计费` },
  }),
  complete: (order, store) => ({
    thing1: { value: store.name || '麻将馆' },
    amount2: { value: `¥${((order.actualAmount || order.discountAmount) / 100).toFixed(2)}` },
    date3: { value: order.date },
    phrase4: { value: '已完成' },
  }),
};

exports.main = async (event, context) => {
  const { type, orderId } = event;

  if (!type || !orderId) {
    return { code: -1, data: null, msg: '缺少必要参数 type 或 orderId' };
  }

  if (!TEMPLATE_IDS[type]) {
    return { code: -1, data: null, msg: `未知通知类型: ${type}` };
  }

  try {
    // 1. 查询订单
    const orderRes = await db.collection('orders').doc(orderId).get();
    if (!orderRes.data) {
      return { code: -1, data: null, msg: '订单不存在' };
    }

    const order = orderRes.data;

    // 2. 查询门店名称
    let store = { name: '' };
    try {
      const storeRes = await db.collection('stores').doc(order.storeId).get();
      if (storeRes.data) store = storeRes.data;
    } catch (e) { /* ignore */ }

    // 3. 构建模板消息
    const templateData = TEMPLATE_DATA_MAP[type](order, store);

    // 4. 调用微信订阅消息接口
    const sendResult = await cloud.openapi.subscribeMessage.send({
      touser: order.userId,              // 接收者 openid
      page: `/pages/orderDetail/orderDetail?orderId=${orderId}`,
      lang: 'zh_CN',
      data: templateData,
      templateId: TEMPLATE_IDS[type],
      miniprogramState: 'formal',       // 正式版，开发阶段用 'developer'
    });

    // 5. 记录通知日志
    await db.collection('notifications').add({
      data: {
        _openid: order.userId,
        templateId: TEMPLATE_IDS[type],
        type,
        data: templateData,
        sendTime: new Date(),
        status: 'success',
      },
    });

    return {
      code: 0,
      data: { success: true, msgId: sendResult.msgid },
      msg: '通知发送成功',
    };
  } catch (err) {
    console.error('sendSubscribeMessage 异常:', err);

    // 记录失败日志
    try {
      await db.collection('notifications').add({
        data: {
          _openid: '',
          templateId: TEMPLATE_IDS[type],
          type,
          data: { error: err.message },
          sendTime: new Date(),
          status: 'fail',
        },
      });
    } catch (e) { /* ignore */ }

    // 订阅消息发送失败不阻塞主流程
    return { code: 0, data: { success: false }, msg: err.message || '发送失败（已忽略）' };
  }
};
