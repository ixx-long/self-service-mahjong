// 云函数：getStoreDetail
// 功能：获取门店详情 + 指定日期所有桌位 + 时段占用情况 + 评价摘要
// 入参：{ storeId: string, date: string }
// 出参：{ code: 0, data: { store, tables[], timeSlots[], reviewSummary }, msg: 'ok' }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const { storeId, date } = event;

  if (!storeId || !date) {
    return { code: -1, data: null, msg: '缺少 storeId 或 date 参数' };
  }

  try {
    // 1. 获取门店信息
    const storeRes = await db.collection('stores').doc(storeId).get();
    if (!storeRes.data) {
      return { code: -1, data: null, msg: '门店不存在' };
    }

    // 2. 获取该门店所有桌位
    const tablesRes = await db.collection('tables')
      .where({ storeId })
      .orderBy('tableNo', 'asc')
      .get();

    // 3. 获取该日期的时段占用情况
    const slotsRes = await db.collection('time_slots')
      .where({
        storeId,
        date,
      })
      .get();

    // 构建时段占用 Map：key = `${tableId}_${slot}`
    const slotMap = {};
    slotsRes.data.forEach(s => {
      slotMap[`${s.tableId}_${s.slot}`] = s;
    });

    // 获取默认时段列表
    const settingRes = await db.collection('settings')
      .where({ key: 'timeSlots' })
      .get();
    const defaultSlots = settingRes.data.length > 0
      ? settingRes.data[0].value
      : ['10:00-14:00', '14:00-18:00', '18:00-22:00', '22:00-02:00'];

    // 组装桌位 + 时段数据
    const tables = tablesRes.data.map(table => {
      const timeSlots = defaultSlots.map(slot => {
        const key = `${table._id}_${slot}`;
        const occupied = slotMap[key];
        return {
          slot,
          status: occupied ? occupied.status : 'free', // free | booked | occupied
        };
      });

      return {
        _id: table._id,
        tableNo: table.tableNo,
        type: table.type,
        status: table.status,
        hourlyPrice: table.hourlyPrice,
        timeSlots,
      };
    });

    // 4. 获取评价摘要（平均分和总数）
    const reviewSummary = await getReviewSummary(db, storeId);

    return {
      code: 0,
      data: {
        store: storeRes.data,
        tables,
        defaultSlots,
        reviewSummary, // { avgRating, totalReviews }
      },
      msg: 'ok',
    };
  } catch (err) {
    console.error('getStoreDetail 异常:', err);
    return { code: -1, data: null, msg: err.message || '获取门店详情失败' };
  }
};

/**
 * 获取门店评价摘要
 */
async function getReviewSummary(db, storeId) {
  try {
    const res = await db.collection('reviews')
      .where({ storeId })
      .field({ rating: true })
      .get();

    const totalReviews = res.data.length;
    if (totalReviews === 0) {
      return { avgRating: 0, totalReviews: 0 };
    }

    const sum = res.data.reduce((acc, r) => acc + r.rating, 0);
    const avgRating = Math.round((sum / totalReviews) * 10) / 10; // 保留 1 位小数

    return { avgRating, totalReviews };
  } catch (err) {
    console.warn('获取评价摘要失败, 忽略:', err.message);
    return { avgRating: 0, totalReviews: 0 };
  }
}
