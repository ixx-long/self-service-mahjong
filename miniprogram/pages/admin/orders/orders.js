// 订单管理
const app = getApp();
const { callFunction } = require('../../../utils/cloud');
const { formatAmount, formatDateChinese } = require('../../../utils/util');

const STATUS_MAP = { pending:'待支付', paid:'已支付', using:'进行中', completed:'已完成', cancelled:'已取消' };

Page({
  data: {
    orders: [], stores: [], loading: true,
    filterStatus: '', filterStoreId: '', filterStoreName: '全部门店',
  },

  onLoad() {
    if (!app.checkAdmin()) { wx.navigateBack(); return; }
    this.loadStores();
  },

  async loadStores() {
    const db = wx.cloud.database();
    const res = await db.collection('stores').get();
    this.setData({ stores: res.data || [] });
    this.loadOrders();
  },

  async loadOrders() {
    this.setData({ loading: true });
    const res = await callFunction('adminManage', {
      action: 'getOrderList',
      payload: { storeId: this.data.filterStoreId, status: this.data.filterStatus },
    });
    if (res.code === 0) {
      const orders = (res.data.orders || []).map(o => ({
        ...o, statusText: STATUS_MAP[o.status]||o.status, amountText: formatAmount(o.discountAmount),
      }));
      this.setData({ orders, loading: false });
    }
  },

  onStatusFilter(e) { this.setData({ filterStatus: e.currentTarget.dataset.status }); this.loadOrders(); },
  onStoreFilter(e) {
    const idx = e.detail.value;
    const store = idx >= 0 ? this.data.stores[idx] : null;
    this.setData({
      filterStoreId: store ? store._id : '',
      filterStoreName: store ? store.name : '全部门店',
    });
    this.loadOrders();
  },

  async onRefund(e) {
    const id = e.currentTarget.dataset.id;
    const r = await new Promise(r => wx.showModal({ title:'确认退款', content:'将全额退款到用户余额', success: res => r(res.confirm) }));
    if (!r) return;
    const res = await callFunction('adminManage', { action:'refundOrder', payload:{orderId:id} });
    wx.showToast({ title: res.msg, icon: res.code===0?'success':'error' });
    if (res.code===0) this.loadOrders();
  },

  async onForceFinish(e) {
    const id = e.currentTarget.dataset.id;
    const r = await new Promise(r => wx.showModal({ title:'强制结束', content:'将立即结束该订单并释放桌位', success: res => r(res.confirm) }));
    if (!r) return;
    const res = await callFunction('adminManage', { action:'forceFinish', payload:{orderId:id} });
    wx.showToast({ title: res.msg, icon: res.code===0?'success':'error' });
    if (res.code===0) this.loadOrders();
  },
});
