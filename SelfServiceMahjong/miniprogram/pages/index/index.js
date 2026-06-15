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
        const stores = (res.data.stores || []).map(s => {
          // 客户端重新算距离（云函数可能返回 0）
          let dist = s.distance;
          if (!dist && s.location && s.location.coordinates) {
            dist = haversine(pos.latitude, pos.longitude, s.location.coordinates[1], s.location.coordinates[0]);
          }
          return { ...s, distance: dist, distanceText: formatDistance(dist) };
        });
        stores.sort((a, b) => a.distance - b.distance);
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

  /** 组件事件：点击门店卡片（防抖 500ms） */
  onStoreTap(e) {
    const now = Date.now();
    if (this._lastTap && now - this._lastTap < 500) return;
    this._lastTap = now;
    const storeId = e.detail.storeId;
    wx.navigateTo({ url: `/pages/store/store?storeId=${storeId}` });
  },

  onRetryLocation() { this.loadStores(); },
});

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
