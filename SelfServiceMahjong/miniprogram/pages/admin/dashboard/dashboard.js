// 管理仪表盘
const app = getApp();
const { callFunction } = require('../../../utils/cloud');
const { formatAmount } = require('../../../utils/util');

Page({
  data: {
    stats: null,
    period: 'today',
    loading: true,
  },

  onLoad() {
    if (!app.checkAdmin()) {
      wx.showToast({ title: '无权限', icon: 'error' });
      wx.navigateBack();
      return;
    }
    this.loadStats();
  },

  async loadStats() {
    this.setData({ loading: true });
    const res = await callFunction('adminManage', {
      action: 'getStatistics',
      payload: { period: this.data.period },
    });

    if (res.code === 0) {
      this.setData({
        stats: res.data,
        loading: false,
      });
    } else {
      wx.showToast({ title: res.msg, icon: 'error' });
      this.setData({ loading: false });
    }
  },

  onPeriodChange(e) {
    const period = e.currentTarget.dataset.period;
    if (period === this.data.period) return;
    this.setData({ period });
    this.loadStats();
  },

  // 快捷入口
  goTo(e) {
    const { page } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/admin/${page}/${page}` });
  },
});
