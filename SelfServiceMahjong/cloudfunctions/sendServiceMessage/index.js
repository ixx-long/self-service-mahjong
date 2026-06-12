// 云函数：sendServiceMessage
// 功能：发送客服消息（用户端 + 管理端共用）
// 入参：{ content, type:'text'|'image' }
// 出参：{ code: 0, data: { message }, msg: 'ok' }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { content, type = 'text' } = event;

  if (!content) return { code: -1, data: null, msg: '消息内容不能为空' };

  try {
    // 判断发送者角色
    let from = 'user';
    try {
      const userRes = await db.collection('users').where({ _openid: OPENID, role: 'admin' }).get();
      if (userRes.data && userRes.data.length > 0) from = 'admin';
    } catch (e) { /* ignore */ }

    const msgData = {
      _openid: OPENID,
      content,
      type,
      from,
      createTime: new Date(),
    };

    const res = await db.collection('service_messages').add({ data: msgData });
    msgData._id = res._id;

    return { code: 0, data: { message: msgData }, msg: '发送成功' };
  } catch (err) {
    console.error('sendServiceMessage 异常:', err);
    return { code: -1, data: null, msg: err.message || '发送失败' };
  }
};
