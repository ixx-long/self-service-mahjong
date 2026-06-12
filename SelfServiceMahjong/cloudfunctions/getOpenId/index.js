// 云函数：getOpenId
// 功能：获取用户 openid，新用户自动注册，同步管理员身份，返回用户信息
// 入参：无（从云函数 context 中取 OPENID）
// 出参：{ code: 0, data: { user }, msg: 'ok' }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) {
    return { code: -1, data: null, msg: '获取 openid 失败' };
  }

  try {
    // 读取管理员列表
    let isAdmin = false;
    try {
      const adminRes = await db.collection('settings').where({ key: 'adminOpenIds' }).get();
      if (adminRes.data && adminRes.data.length > 0) {
        const adminOpenIds = adminRes.data[0].value || [];
        isAdmin = Array.isArray(adminOpenIds) && adminOpenIds.includes(OPENID);
      }
    } catch (e) {
      // settings 集合可能不存在，忽略
      console.warn('读取 adminOpenIds 失败:', e.message);
    }

    // 查询用户是否已存在
    const res = await db.collection('users').where({ _openid: OPENID }).get();

    if (res.data && res.data.length > 0) {
      const user = res.data[0];

      // 兜底：老数据可能缺 _openid
      if (!user._openid) {
        await db.collection('users').doc(user._id).update({
          data: { _openid: OPENID },
        });
        user._openid = OPENID;
      }

      // 同步管理员身份：如果 settings 里是管理员但 users 里不是，更新
      if (isAdmin && user.role !== 'admin') {
        await db.collection('users').doc(user._id).update({
          data: { role: 'admin' },
        });
        user.role = 'admin';
      }

      // 检查是否被拉黑
      if (user.isBlocked) {
        return { code: -2, data: null, msg: '账号已被限制使用' };
      }

      return { code: 0, data: user, msg: 'ok' };
    }

    // 新用户：自动注册
    const newUser = {
      _openid: OPENID,
      nickName: '',
      avatarUrl: '',
      phone: '',
      balance: 0,
      role: isAdmin ? 'admin' : 'user',
      isBlocked: false,
      createTime: new Date(),
    };

    const addRes = await db.collection('users').add({ data: newUser });
    newUser._id = addRes._id;

    return { code: 0, data: newUser, msg: '新用户注册成功' };
  } catch (err) {
    console.error('getOpenId 异常:', err);
    return { code: -1, data: null, msg: err.message || '服务异常' };
  }
};
