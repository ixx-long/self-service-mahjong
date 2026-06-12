// 首页：附近门店列表
const app = getApp();
const { callFunction } = require('../../utils/cloud');
const { formatDistance } = require('../../utils/util');

Page({
  data: {
    stores: [],
    loading: true,
    refreshing: false,
    hasLocation: false,
    errorMsg: '',
  },

  onLoad() { this.loadStores(); },

  onShow() {
    if (!this.data.loading && this.data.stores.length > 0) this.loadStores(false);
  },

  onPullDownRefresh() {
    this.setData({ refreshing: true });
    this.loadStores(false).finally(() => wx.stopPullDownRefresh());
  },

  async loadStores(showLoading = true) {
    if (showLoading) this.setData({ loading: true, errorMsg: '' });
    try {
      const pos = await app.getLocation();
      const res = await callFunction('getNearbyStores', { latitude: pos.latitude, longitude: pos.longitude });
      if (res.code === 0) {
        const stores = (res.data.stores || []).map(s => ({
          ...s, distanceText: formatDistance(s.distance),
        }));
        this.setData({ stores, loading: false, refreshing: false, hasLocation: true });
      } else if (res.code === -2) {
        this.setData({ loading: false, refreshing: false, errorMsg: res.msg });
        wx.showModal({ title: '配置提示', content: res.msg, showCancel: false });
      } else {
        this.setData({ loading: false, refreshing: false, errorMsg: res.msg || '加载失败' });
      }
    } catch (err) {
      this.setData({ loading: false, refreshing: false, errorMsg: '网络异常，请下拉刷新重试' });
    }
  },

  /** 组件事件：点击门店卡片 */
  onStoreTap(e) {
    const { storeId } = e.detail;
    wx.navigateTo({ url: `/pages/store/store?storeId=${storeId}` });
  },

  onRetryLocation() { this.loadStores(); },
});
