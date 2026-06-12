// 云函数：getNearbyStores
// 功能：返回附近门店，计算"今日可预约桌数"（至少一个时段未被订满）
// 入参：{ latitude, longitude, radius? }
// 出参：{ code: 0, data: { stores[] }, msg: 'ok' }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { latitude, longitude, radius = 10000 } = event;

  if (!latitude || !longitude) {
    return { code: -1, data: null, msg: '缺少经纬度参数' };
  }

  try {
    // 1. 获取今日日期 和 全部时段列表
    const today = formatDate(new Date());
    let allSlots = ['10:00-14:00', '14:00-18:00', '18:00-22:00', '22:00-02:00'];
    try {
      const slotSetting = await db.collection('settings').where({ key: 'timeSlots' }).get();
      if (slotSetting.data && slotSetting.data.length > 0 && Array.isArray(slotSetting.data[0].value)) {
        allSlots = slotSetting.data[0].value;
      }
    } catch (e) { /* 使用默认时段 */ }

    const totalSlotCount = allSlots.length;

    // 2. 附近门店
    const geoResult = await db.collection('stores')
      .where({
        status: 'open',
        location: _.geoNear({
          geometry: db.Geo.Point(longitude, latitude),
          maxDistance: radius,
        }),
      })
      .field({
        name: true, address: true, location: true, phone: true,
        openTime: true, closeTime: true, tablesCount: true,
      })
      .get();

    if (!geoResult.data || geoResult.data.length === 0) {
      return { code: 0, data: { stores: [] }, msg: '附近暂无门店' };
    }

    // 3. 为每个门店统计今日空闲桌数
    const stores = await Promise.all(geoResult.data.map(async (store) => {
      // 获取该门店所有桌位
      const tablesRes = await db.collection('tables')
        .where({ storeId: store._id, status: _.neq('maintenance') })
        .get();
      const tables = tablesRes.data || [];

      if (tables.length === 0) {
        return {
          ...formatStore(store, null),
          tablesCount: 0,
          freeCount: 0,
        };
      }

      // 查询今日所有被占用的时段，按桌位分组计数
      const bookedSlots = await db.collection('time_slots')
        .where({
          storeId: store._id,
          date: today,
          status: _.in(['booked', 'occupied']),
        })
        .get();

      // 统计每张桌被占的时段数
      const bookedMap = {};
      (bookedSlots.data || []).forEach(s => {
        bookedMap[s.tableId] = (bookedMap[s.tableId] || 0) + 1;
      });

      // 可预约 = 至少有一个时段没被占
      const freeCount = tables.filter(t => {
        const bookedCount = bookedMap[t._id] || 0;
        return bookedCount < totalSlotCount;
      }).length;

      return {
        ...formatStore(store, null),
        tablesCount: tables.length,
        freeCount,
      };
    }));

    return { code: 0, data: { stores }, msg: 'ok' };
  } catch (err) {
    console.error('getNearbyStores 异常:', err);
    if (err.errCode === -1 && err.message && err.message.includes('geo')) {
      return { code: -2, data: null, msg: 'stores 集合缺少地理位置索引，请在云开发控制台 → 数据库 → stores → 索引管理 → 添加 location 字段的地理位置索引' };
    }
    return { code: -1, data: null, msg: err.message || '查询失败' };
  }
};

function formatStore(store, distance) {
  return {
    _id: store._id,
    name: store.name,
    address: store.address,
    location: store.location,
    phone: store.phone,
    openTime: store.openTime,
    closeTime: store.closeTime,
    tablesCount: store.tablesCount,
    distance: distance,
  };
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
