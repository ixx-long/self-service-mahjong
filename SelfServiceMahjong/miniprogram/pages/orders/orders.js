// 我的订单列表：Tab 切换 + 状态筛选
const { callFunction } = require('../../utils/cloud');
const { formatAmount, formatDateChinese } = require('../../utils/util');

const STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待支付' },
  { key: 'paid', label: '已支付' },
  { key: 'using', label: '进行中' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
];

const STATUS_MAP = {
  pending: '待支付',
  paid: '已支付',
  using: '进行中',
  completed: '已完成',
  cancelled: '已取消',
};

Page({
  data: {
    tabs: STATUS_TABS,
    activeTab: 'all', activeTabLabel: '全部',
    orders: [],
    loading: true,
    refreshing: false,
    hasMore: true,
  },

  onLoad() {
    this.loadOrders();
  },

  onShow() {
    // 从详情页返回时刷新
    if (!this.data.loading) {
      this.loadOrders(false);
    }
  },

  onPullDownRefresh() {
    this.setData({ refreshing: true });
    this.loadOrders(false).finally(() => wx.stopPullDownRefresh());
  },

  /** 切换 Tab */
  onTabChange(e) {
    const { tab } = e.currentTarget.dataset;
    if (tab === this.data.activeTab) return;
    const activeTabLabel = STATUS_TABS.find(t => t.key === tab).label;
    this.setData({ activeTab: tab, activeTabLabel, orders: [], hasMore: true });
    this.loadOrders();
  },

  /** 加载订单 */
  async loadOrders(showLoading = true) {
    if (showLoading) this.setData({ loading: true });

    try {
      const app = getApp();
      const openid = app.globalData.userInfo && app.globalData.userInfo._openid;
      if (!openid) {
        this.setData({ loading: false, orders: [] });
        return;
      }

      const db = wx.cloud.database();
      const where = { _openid: openid };
      if (this.data.activeTab !== 'all') {
        where.status = this.data.activeTab;
      }

      const res = await db.collection('orders')
        .where(where)
        .orderBy('createTime', 'desc')
        .limit(20)
        .get();

      const orders = (res.data || []).map(order => ({
        ...order,
        statusText: STATUS_MAP[order.status] || order.status,
        amountText: formatAmount(order.amount),
        dateText: formatDateChinese(order.date),
      }));

      this.setData({
        orders,
        loading: false,
        refreshing: false,
        hasMore: orders.length >= 20,
      });
    } catch (err) {
      console.error('加载订单失败:', err);
      this.setData({ loading: false, refreshing: false });
      wx.showToast({ title: '加载失败', icon: 'error' });
    }
  },

  /** 点击订单 → 详情页 */
  onOrderTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) {
      wx.showToast({ title: '订单数据异常', icon: 'error' });
      return;
    }
    wx.navigateTo({ url: `/pages/orderDetail/orderDetail?orderId=${id}` });
  },

  /** 快捷操作：去支付 */
  async onQuickPay(e) {
    const { id } = e.currentTarget.dataset;
    wx.showLoading({ title: '支付中...' });
    const res = await callFunction('payOrder', { orderId: id });
    wx.hideLoading();

    if (res.code === 0) {
      wx.showToast({ title: '支付成功', icon: 'success' });
      this.loadOrders(false);
    } else {
      wx.showToast({ title: res.msg, icon: 'error' });
    }
  },

  /** 快捷操作：取消订单 */
  async onQuickCancel(e) {
    const { id } = e.currentTarget.dataset;
    const confirm = await this.showModal('确认取消该订单？已支付的订单将退款到余额。');

    if (!confirm) return;

    wx.showLoading({ title: '取消中...' });
    const res = await callFunction('cancelOrder', { orderId: id });
    wx.hideLoading();

    if (res.code === 0) {
      wx.showToast({ title: res.msg, icon: 'success' });
      this.loadOrders(false);
    } else {
      wx.showToast({ title: res.msg, icon: 'error' });
    }
  },

  showModal(content) {
    return new Promise(resolve => {
      wx.showModal({
        title: '提示',
        content,
        success: res => resolve(res.confirm),
      });
    });
  },
});
