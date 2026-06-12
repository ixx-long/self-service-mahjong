// 确认预约页：展示详情 + 确认支付
const { callFunction } = require('../../utils/cloud');
const { formatAmount, formatDateChinese } = require('../../utils/util');

Page({
  data: {
    storeId: '',
    tableId: '',
    date: '',
    slot: '',

    // 详情
    storeName: '',
    tableNo: '',
    dateText: '',
    hourlyPrice: 0,
    slotHours: 4,
    amount: 0,          // 分

    // 状态
    submitting: false,
    payed: false,
    orderId: '',
  },

  onLoad(options) {
    const { storeId, tableId, date, slot } = options;

    if (!storeId || !tableId || !date || !slot) {
      wx.showToast({ title: '参数不完整', icon: 'error' });
      wx.navigateBack();
      return;
    }

    // 计算时段小时数
    const slotHours = this.calcHours(slot);

    this.setData({
      storeId,
      tableId,
      date,
      slot,
      slotHours,
      dateText: formatDateChinese(date),
    });

    this.loadDetail();
  },

  /** 加载门店和桌位详情用于展示 */
  async loadDetail() {
    try {
      const res = await callFunction('getStoreDetail', {
        storeId: this.data.storeId,
        date: this.data.date,
      });

      if (res.code === 0) {
        const { store, tables } = res.data;
        const table = tables.find(t => t._id === this.data.tableId);

        if (table) {
          const amount = table.hourlyPrice * this.data.slotHours; // 分
          this.setData({
            storeName: store.name,
            tableNo: table.tableNo,
            hourlyPrice: table.hourlyPrice,
            amount,
          });
        }
      }
    } catch (err) {
      console.error('加载详情失败:', err);
    }
  },

  /** 计算时段小时数 */
  calcHours(slot) {
    const parts = slot.split('-');
    if (parts.length !== 2) return 4;
    const [h1, m1] = parts[0].split(':').map(Number);
    const [h2, m2] = parts[1].split(':').map(Number);
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff <= 0) diff += 24 * 60;
    return Math.ceil(diff / 60);
  },

  /** 确认支付 */
  async onConfirmPay() {
    if (this.data.submitting) return;

    this.setData({ submitting: true });

    try {
      // 第一步：创建订单
      const createRes = await callFunction('createOrder', {
        storeId: this.data.storeId,
        tableId: this.data.tableId,
        date: this.data.date,
        timeSlot: this.data.slot,
      });

      if (createRes.code !== 0) {
        wx.showModal({
          title: '预约失败',
          content: createRes.msg,
          showCancel: false,
        });
        this.setData({ submitting: false });
        return;
      }

      const orderId = createRes.data.orderId;

      // 第二步：支付
      const payRes = await callFunction('payOrder', { orderId });

      if (payRes.code !== 0) {
        wx.showModal({
          title: '支付失败',
          content: payRes.msg + '，可在订单列表重新支付',
          showCancel: false,
        });
        this.setData({ submitting: false });
        // 跳转订单详情
        wx.redirectTo({ url: `/pages/orderDetail/orderDetail?orderId=${orderId}` });
        return;
      }

      // 支付成功
      this.setData({
        submitting: false,
        payed: true,
        orderId,
      });

      // 引导用户订阅消息通知
      this.requestSubscribe();

      wx.showToast({ title: '支付成功！', icon: 'success', duration: 1500 });

      // 延迟跳转订单详情
      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/orderDetail/orderDetail?orderId=${orderId}`,
        });
      }, 1500);

    } catch (err) {
      console.error('支付流程异常:', err);
      wx.showToast({ title: '网络异常，请重试', icon: 'error' });
      this.setData({ submitting: false });
    }
  },

  /** 请求订阅消息授权 */
  requestSubscribe() {
    const tmplIds = [
      // 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // 支付成功通知
      // 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // 开台提醒
      // 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // 消费完成通知
    ];
    if (tmplIds.length === 0 || tmplIds[0].startsWith('x')) return;
    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => console.log('订阅授权结果:', res),
      fail: (err) => console.log('订阅授权失败:', err),
    });
  },

  /** 返回修改选择 */
  onBack() {
    wx.navigateBack();
  },
});
