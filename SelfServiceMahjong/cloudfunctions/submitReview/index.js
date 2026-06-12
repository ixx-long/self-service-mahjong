// 云函数：submitReview
// 功能：提交订单评价（星级+文字+图片），同一订单仅可评价一次
// 入参：{ orderId, rating(1-5), content?, images?[] }
// 出参：{ code: 0, data: { review }, msg: 'ok' }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { orderId, rating, content = '', images = [] } = event;

  if (!orderId || !rating) return { code: -1, data: null, msg: '缺少 orderId 或 rating' };
  if (rating < 1 || rating > 5) return { code: -1, data: null, msg: '评分需在 1-5 之间' };

  try {
    // 1. 校验订单归属 + 状态
    const orderRes = await db.collection('orders').doc(orderId).get();
    if (!orderRes.data) return { code: -1, data: null, msg: '订单不存在' };
    const order = orderRes.data;
    if (order.userId !== OPENID) return { code: -1, data: null, msg: '无权评价此订单' };
    if (order.status !== 'completed') return { code: -2, data: null, msg: '仅完成的订单可评价' };

    // 2. 检查是否已评价
    const existRes = await db.collection('reviews').where({ orderId }).get();
    if (existRes.data && existRes.data.length > 0) {
      return { code: -2, data: null, msg: '该订单已评价过' };
    }

    // 3. 写入评价
    const reviewData = {
      userId: OPENID,
      storeId: order.storeId,
      orderId,
      rating,
      content: (content || '').slice(0, 200),
      images,
      createTime: new Date(),
    };
    const addRes = await db.collection('reviews').add({ data: reviewData });
    reviewData._id = addRes._id;

    return { code: 0, data: { review: reviewData }, msg: '评价提交成功' };
  } catch (err) {
    console.error('submitReview 异常:', err);
    return { code: -1, data: null, msg: err.message || '提交失败' };
  }
};
