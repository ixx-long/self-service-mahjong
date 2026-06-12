// 云函数：recharge
// 功能：模拟充值，仅管理员可为指定用户充值
// 入参：{ targetOpenId: string, amount: number }
// 出参：{ code: 0, data: { newBalance }, msg: 'ok' }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { targetOpenId, amount } = event;

  if (!targetOpenId || !amount || amount <= 0) {
    return { code: -1, data: null, msg: '参数无效' };
  }

  // 仅管理员可充值
  try {
    const adminRes = await db.collection('users')
      .where({ _openid: OPENID, role: 'admin', isBlocked: false })
      .get();
    if (!adminRes.data || adminRes.data.length === 0) {
      return { code: -403, data: null, msg: '仅管理员可执行充值' };
    }
  } catch (e) {
    return { code: -1, data: null, msg: '权限校验失败' };
  }

  try {
    // 查找目标用户
    const userRes = await db.collection('users').where({ _openid: targetOpenId }).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { code: -1, data: null, msg: '目标用户不存在' };
    }

    const user = userRes.data[0];
    await db.collection('users').doc(user._id).update({
      data: { balance: _.inc(amount) },
    });

    return {
      code: 0,
      data: { newBalance: user.balance + amount, openid: targetOpenId },
      msg: `成功充值 ¥${(amount / 100).toFixed(2)}`,
    };
  } catch (err) {
    console.error('recharge 异常:', err);
    return { code: -1, data: null, msg: err.message || '充值失败' };
  }
};
