// 云函数：getNearbyStores
// 功能：返回所有营业门店，计算距离和今日可预约桌数，按距离排序
// 入参：{ latitude, longitude }
// 出参：{ code: 0, data: { stores[] }, msg: 'ok' }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { latitude, longitude } = event;

  if (!latitude || !longitude) {
    return { code: -1, data: null, msg: '缺少经纬度参数' };
  }

  try {
    // 1. 获取今日日期和全部时段列表
    const today = formatDate(new Date());
    let allSlots = ['10:00-14:00', '14:00-18:00', '18:00-22:00', '22:00-02:00'];
    try {
      const slotSetting = await db.collection('settings').where({ key: 'timeSlots' }).get();
      if (slotSetting.data && slotSetting.data.length > 0 && Array.isArray(slotSetting.data[0].value)) {
        allSlots = slotSetting.data[0].value;
      }
    } catch (e) { /* ignore */ }
    const totalSlotCount = allSlots.length;

    // 2. 获取所有营业门店
    const storeResult = await db.collection('stores')
      .where({ status: 'open' })
      .field({
        name: true, address: true, location: true, phone: true,
        openTime: true, closeTime: true, tablesCount: true,
      })
      .get();

    if (!storeResult.data || storeResult.data.length === 0) {
      return { code: 0, data: { stores: [] }, msg: '暂无门店' };
    }

    // 3. 为每个门店计算距离 + 空闲桌数，再按距离排序
    const stores = await Promise.all(storeResult.data.map(async (store) => {
      const distance = haversine(latitude, longitude, store.location);

      // 获取桌位
      const tablesRes = await db.collection('tables')
        .where({ storeId: store._id, status: _.neq('maintenance') })
        .get();
      const tables = tablesRes.data || [];

      if (tables.length === 0) {
        return {
          _id: store._id, name: store.name, address: store.address,
          location: store.location, phone: store.phone,
          openTime: store.openTime, closeTime: store.closeTime,
          tablesCount: 0, freeCount: 0, distance,
        };
      }

      // 查询今日已占时段
      const bookedSlots = await db.collection('time_slots')
        .where({
          storeId: store._id,
          date: today,
          status: _.in(['booked', 'occupied']),
        })
        .get();

      const bookedMap = {};
      (bookedSlots.data || []).forEach(s => {
        bookedMap[s.tableId] = (bookedMap[s.tableId] || 0) + 1;
      });

      const freeCount = tables.filter(t => {
        return (bookedMap[t._id] || 0) < totalSlotCount;
      }).length;

      return {
        _id: store._id, name: store.name, address: store.address,
        location: store.location, phone: store.phone,
        openTime: store.openTime, closeTime: store.closeTime,
        tablesCount: tables.length, freeCount, distance,
      };
    }));

    // 按距离升序排列
    stores.sort((a, b) => a.distance - b.distance);

    return { code: 0, data: { stores, _ver: 3 }, msg: 'ok' };
  } catch (err) {
    console.error('getNearbyStores 异常:', err);
    return { code: -1, data: null, msg: err.message || '查询失败' };
  }
};

function haversine(lat1, lng1, location) {
  if (!location) return 0;
  // Geo Point 对象：优先取 lng/lat，兜底取 coordinates 数组
  const lng2 = location.lng != null ? location.lng : (location.coordinates ? location.coordinates[0] : null);
  const lat2 = location.lat != null ? location.lat : (location.coordinates ? location.coordinates[1] : null);
  if (lng2 == null || lat2 == null) return 0;
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

