// 我的评价
const app = getApp();
const { formatTime } = require('../../utils/util');

Page({
  data: { reviews: [], loading: true },

  onShow() { this.loadReviews(); },

  async loadReviews() {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('reviews')
        .where({ _openid: app.globalData.userInfo._openid })
        .orderBy('createTime', 'desc')
        .get();
      const reviews = (res.data || []).map(r => ({
        ...r,
        createTimeText: formatTime(r.createTime),
      }));
      this.setData({ reviews, loading: false });
    } catch (err) {
      console.error('加载评价失败:', err);
      this.setData({ loading: false });
    }
  },
});
