// 云函数：getServiceMessages
// 功能：获取客服消息列表（用户端查自己的，管理端查指定用户的）
// 入参：{ targetOpenId?, page? }
// 出参：{ code: 0, data: { messages[] }, msg: 'ok' }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { targetOpenId, page = 1 } = event;
  const pageSize = 50;

  try {
    // 判断角色
    let isAdmin = false;
    try {
      const userRes = await db.collection('users').where({ _openid: OPENID, role: 'admin' }).get();
      isAdmin = userRes.data && userRes.data.length > 0;
    } catch (e) { /* ignore */ }

    // 管理员可查看指定用户的消息，普通用户只看自己的
    const queryOpenId = isAdmin && targetOpenId ? targetOpenId : OPENID;

    const res = await db.collection('service_messages')
      .where({ _openid: queryOpenId })
      .orderBy('createTime', 'asc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    return {
      code: 0,
      data: { messages: res.data || [], page, hasMore: (res.data || []).length >= pageSize },
      msg: 'ok',
    };
  } catch (err) {
    console.error('getServiceMessages 异常:', err);
    return { code: -1, data: null, msg: err.message || '获取消息失败' };
  }
};
