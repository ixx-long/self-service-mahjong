// 门店详情页
const { callFunction } = require('../../utils/cloud');
const { getTodayStr, getNextDays, formatDateChinese } = require('../../utils/util');

Page({
  data: {
    storeId: '', store: null, tables: [], defaultSlots: [],
    reviewSummary: { avgRating: 0, totalReviews: 0 },
    dates: getNextDays(7), selectedDate: getTodayStr(), selectedDateText: formatDateChinese(getTodayStr()),
    selectedTableId: '', selectedSlot: '',
    loading: true, errorMsg: '',
  },

  onLoad(options) {
    // 防重复：用 JS 属性而非 setData（同步生效）
    if (this.__loaded) return;
    this.__loaded = true;

    const storeId = options.storeId;
    console.log('store接收storeId:', storeId);
    if (!storeId || storeId === 'undefined' || storeId === 'null') {
      wx.showToast({ title: '门店参数无效', icon: 'error' });
      const pages = getCurrentPages();
      if (pages.length > 1) {
        setTimeout(() => wx.navigateBack(), 1000);
      } else {
        setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 1000);
      }
      return;
    }
    this.setData({ storeId, selectedDate: getTodayStr(), selectedDateText: formatDateChinese(getTodayStr()) });
    this.loadDetail();
  },

  onPullDownRefresh() { this.loadDetail().finally(() => wx.stopPullDownRefresh()); },

  async loadDetail() {
    this.setData({ loading: true, errorMsg: '' });
    const res = await callFunction('getStoreDetail', { storeId: this.data.storeId, date: this.data.selectedDate });
    if (res.code === 0) {
      this.setData({ ...res.data, loading: false, selectedTableId: '', selectedSlot: '' });
    } else {
      wx.showToast({ title: res.msg, icon: 'error' });
      this.setData({ loading: false, errorMsg: res.msg });
    }
  },

  onDateChange(e) {
    const date = e.currentTarget.dataset.date;
    if (date === this.data.selectedDate) return;
    this.setData({ selectedDate: date, selectedDateText: formatDateChinese(date), selectedTableId: '', selectedSlot: '' });
    this.loadDetail();
  },

  /** 组件事件：选中时段 */
  onSlotSelect(e) {
    const { tableId, slot } = e.detail;
    this.setData({ selectedTableId: tableId, selectedSlot: slot });
  },

  onConfirm() {
    const { selectedTableId, selectedSlot, storeId, selectedDate } = this.data;
    if (!selectedTableId || !selectedSlot) { wx.showToast({ title: '请选择桌位和时段', icon: 'none' }); return; }
    wx.navigateTo({ url: `/pages/confirm/confirm?storeId=${storeId}&tableId=${selectedTableId}&date=${selectedDate}&slot=${selectedSlot}` });
  },

  onCallPhone() {
    if (this.data.store && this.data.store.phone) wx.makePhoneCall({ phoneNumber: this.data.store.phone });
  },

  /** 导航到门店 */
  onNavigate() {
    const store = this.data.store;
    if (!store || !store.location || !store.location.coordinates) {
      wx.showToast({ title: '门店坐标缺失', icon: 'none' });
      return;
    }
    const coords = store.location.coordinates;
    wx.openLocation({
      latitude: coords[1],
      longitude: coords[0],
      name: store.name,
      address: store.address,
      scale: 16,
    });
  },
});
