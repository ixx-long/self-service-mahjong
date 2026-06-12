// 云函数：generateDoorCode
// 功能：为已支付订单生成动态开门码，返回二维码图片（base64）和过期时间
// 入参：{ orderId: string }
// 出参：{ code: 0, data: { doorCode, qrcodeBase64, expireTime }, msg: 'ok' }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const QRCode = require('qrcode');

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

    if (order.status !== 'paid') {
      const statusMap = {
        pending: '订单未支付',
        using: '订单已开台',
        completed: '订单已完成',
        cancelled: '订单已取消',
      };
      return { code: -2, data: null, msg: statusMap[order.status] || '订单状态不允许生成开门码' };
    }

    // 2. 获取签名密钥
    const secretRes = await db.collection('settings')
      .where({ key: 'doorCodeSecret' })
      .get();

    if (!secretRes.data || secretRes.data.length === 0) {
      return { code: -1, data: null, msg: '系统配置缺失，请先运行初始化' };
    }

    const secret = secretRes.data[0].value;
    const timestamp = Date.now();

    // SHA256(orderId + timestamp + secret)
    const crypto = require('crypto');
    const rawStr = `${orderId}|${timestamp}|${secret}`;
    const sign = crypto.createHash('sha256').update(rawStr).digest('hex');

    // 过期时间：5 分钟
    const expireTime = new Date(timestamp + 5 * 60 * 1000);

    // 3. 存签名和过期时间
    await db.collection('orders').doc(orderId).update({
      data: {
        doorCodeSign: sign,
        doorCodeExpire: expireTime,
      },
    });

    // 开门码内容
    const doorCode = `${orderId}|${timestamp}|${sign}`;

    // 4. 生成二维码 base64
    const qrcodeBase64 = await QRCode.toDataURL(doorCode, {
      width: 400,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    return {
      code: 0,
      data: {
        doorCode,
        qrcodeBase64,
        expireTime: expireTime.toISOString(),
        expireInSeconds: 300,
      },
      msg: '开门码生成成功',
    };
  } catch (err) {
    console.error('generateDoorCode 异常:', err);
    return { code: -1, data: null, msg: err.message || '生成开门码失败' };
  }
};
