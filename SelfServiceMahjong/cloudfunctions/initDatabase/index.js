// 云函数：initDatabase
// 功能：初始化数据库，写入 settings 集合的默认配置 + 创建必要索引（提示）
// 入参：{}
// 出参：{ code: 0, data: { result }, msg: 'ok' }
// 注意：此函数可重复执行（使用 upsert 逻辑），不会产生重复数据

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

/** 生成随机密钥 */
function generateSecret(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

exports.main = async (event, context) => {
  const results = [];

  try {
    // ========================================
    // 1. 初始化 settings 集合
    // ========================================
    const settingsData = [
      {
        key: 'adminOpenIds',
        value: [],
        description: '管理员 openid 列表，手动填入',
      },
      {
        key: 'overTimeRate',
        value: 1.5,
        description: '超时罚款倍率（正常单价 × 此值）',
      },
      {
        key: 'doorCodeSecret',
        value: generateSecret(32),
        description: '开门码签名密钥，SHA256(orderId + timestamp + secret)',
      },
      {
        key: 'timeSlots',
        value: ['10:00-14:00', '14:00-18:00', '18:00-22:00', '22:00-02:00'],
        description: '默认时段列表',
      },
      {
        key: 'refundRate',
        value: 1.0,
        description: '退款比率（1.0 = 全额退）',
      },
    ];

    for (const item of settingsData) {
      // 使用 upsert：key 存在则更新 description，不存在则创建
      const exist = await db.collection('settings').where({ key: item.key }).get();
      if (exist.data && exist.data.length > 0) {
        // 已存在：仅更新 description（不覆盖 value）
        await db.collection('settings').doc(exist.data[0]._id).update({
          data: { description: item.description },
        });
        results.push(`settings.${item.key} —— 已存在，跳过（仅更新描述）`);
      } else {
        await db.collection('settings').add({ data: item });
        results.push(`settings.${item.key} —— 已创建`);
      }
    }

    // ========================================
    // 2. 提示：需要手动在云开发控制台创建的索引
    // ========================================
    const indexHints = [
      { collection: 'stores', field: 'location', type: '地理位置索引（geo）', note: '用于 getNearbyStores 的近邻查询' },
      { collection: 'orders', field: 'userId', type: '普通索引', note: '加速用户订单查询' },
      { collection: 'orders', field: 'status', type: '普通索引', note: '加速订单状态筛选' },
      { collection: 'orders', field: 'storeId', type: '普通索引', note: '加速门店订单统计' },
      { collection: 'reviews', field: 'storeId', type: '普通索引', note: '加速门店评价查询' },
      { collection: 'time_slots', field: 'tableId,date,slot', type: '★★★ 唯一索引（防超卖，必建！）', note: '防止同一桌位同一日期同一时段被重复预约' },
      { collection: 'time_slots', field: 'tableId', type: '普通索引', note: '加速桌位时段查询' },
      { collection: 'time_slots', field: 'date', type: '普通索引', note: '加速日期维度查询' },
      { collection: 'notifications', field: '_openid', type: '普通索引', note: '加速用户通知查询' },
      { collection: 'service_messages', field: '_openid', type: '普通索引', note: '加速客服消息查询' },
    ];

    console.log('========== 以下索引需在云开发控制台手动创建 ==========');
    indexHints.forEach(h => {
      console.log(`${h.collection}.${h.field} → ${h.type} | ${h.note}`);
    });

    // ========================================
    // 3. 检查必要集合是否存在（提示性）
    // ========================================
    const requiredCollections = [
      'users', 'stores', 'tables', 'time_slots', 'orders',
      'reviews', 'service_messages', 'notifications', 'settings',
    ];

    const missingCollections = [];
    for (const name of requiredCollections) {
      try {
        await db.collection(name).limit(0).get(); // 只检查集合是否存在
      } catch (err) {
        if (err.errCode === -502005 || err.message.includes('not exist')) {
          missingCollections.push(name);
        }
      }
    }

    if (missingCollections.length > 0) {
      console.warn('以下集合尚未创建，请在云开发控制台中创建：');
      missingCollections.forEach(c => console.warn(`  - ${c}`));
    }

    return {
      code: 0,
      data: {
        settings: results,
        indexHints,
        missingCollections: missingCollections.length > 0 ? missingCollections : null,
        note: '请在云开发控制台 → 数据库 → 索引管理中手动创建上述索引',
      },
      msg: '初始化完成',
    };
  } catch (err) {
    console.error('initDatabase 异常:', err);
    return { code: -1, data: null, msg: err.message || '初始化失败' };
  }
};
