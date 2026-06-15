// 订单详情页：含开门码、实时计时、操作按钮
const { callFunction } = require('../../utils/cloud');
const { formatTime, formatAmount, formatDateChinese, formatDuration, diffMinutes } = require('../../utils/util');

Page({
  data: {
    orderId: '',
    order: null,
    storeName: '',
    tableNo: '',

    // 开门码
    doorCode: '',
    qrcodeImage: '', // 二维码 base64 图片
    doorCodeExpireText: '',
    doorCodeExpired: false,
    generatingCode: false,
    codeRefreshTimer: null,

    // 进行中计时
    usingTimer: null,
    elapsedText: '0分',
    estimatedAmount: 0,

    // 时间轴
    timeline: [],

    // 结算结果弹窗
    showSettleModal: false,
    settleResult: null,

    loading: true,
  },

  onLoad(options) {
    if (this.__loaded) return;
    this.__loaded = true;
    const orderId = options.orderId;
    if (!orderId || orderId === 'undefined' || orderId === 'null') {
      wx.showToast({ title: '订单参数无效', icon: 'error' });
      const pages = getCurrentPages();
      if (pages.length > 1) {
        wx.navigateBack();
      } else {
        wx.switchTab({ url: '/pages/index/index' });
      }
      return;
    }
    this.setData({ orderId });
    this.loadOrder();
  },

  onUnload() {
    // 清除所有定时器
    this.clearAllTimers();
  },

  /** 清除定时器 */
  clearAllTimers() {
    if (this.data.codeRefreshTimer) clearInterval(this.data.codeRefreshTimer);
    if (this.data.usingTimer) clearInterval(this.data.usingTimer);
  },

  /** 加载订单数据 */
  async loadOrder() {
    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();
      const res = await db.collection('orders').doc(this.data.orderId).get();

      if (!res.data) {
        wx.showToast({ title: '订单不存在', icon: 'error' });
        wx.navigateBack();
        return;
      }

      const order = res.data;

      // 获取门店和桌位名称
      let storeName = '';
      let tableNo = '';
      try {
        const [storeRes, tableRes] = await Promise.all([
          db.collection('stores').doc(order.storeId).get(),
          db.collection('tables').doc(order.tableId).get(),
        ]);
        storeName = storeRes.data ? storeRes.data.name : '';
        tableNo = tableRes.data ? tableRes.data.tableNo : '';
      } catch (e) {
        console.warn('获取门店/桌位信息失败:', e);
      }

      // 构建时间轴
      const timeline = this.buildTimeline(order);

      this.setData({
        order,
        storeName,
        tableNo,
        timeline,
        loading: false,
      });

      // 按状态初始化交互
      if (order.status === 'paid') {
        this.initDoorCode();
      } else if (order.status === 'using') {
        this.startUsingTimer(order);
      }

    } catch (err) {
      console.error('加载订单失败:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'error' });
    }
  },

  /** 构建时间轴 */
  buildTimeline(order) {
    const items = [];
    items.push({
      label: '创建订单',
      time: formatTime(order.createTime),
      done: true,
    });

    if (order.payTime) {
      items.push({
        label: '支付成功',
        time: formatTime(order.payTime),
        done: true,
      });
    } else if (order.status === 'pending') {
      items.push({ label: '等待支付', time: '', done: false });
    }

    if (order.startTime) {
      items.push({
        label: '扫码开台',
        time: formatTime(order.startTime),
        done: true,
      });
    } else if (order.status === 'paid') {
      items.push({ label: '待开台', time: '', done: false });
    }

    if (order.endTime && (order.status === 'completed' || order.status === 'cancelled')) {
      const label = order.status === 'completed' ? '使用完成' : '已取消';
      items.push({ label, time: formatTime(order.endTime), done: true });
    } else if (order.status === 'using') {
      items.push({ label: '使用中...', time: '', done: false });
    }

    return items;
  },

  // ─── 开门码 ───

  /** 初始化开门码 */
  async initDoorCode() {
    await this.generateCode();
    // 每分钟刷新过期提示
    const timer = setInterval(() => {
      this.updateCodeExpire();
    }, 10000); // 10 秒刷新一次显示
    this.setData({ codeRefreshTimer: timer });
  },

  /** 生成开门码 */
  async generateCode() {
    this.setData({ generatingCode: true });

    const res = await callFunction('generateDoorCode', {
      orderId: this.data.orderId,
    });

    if (res.code === 0) {
      this.setData({
        doorCode: res.data.doorCode,
        qrcodeImage: res.data.qrcodeBase64 || '',
        doorCodeExpired: false,
        generatingCode: false,
      });
      this.updateCodeExpire();
    } else {
      wx.showToast({ title: res.msg, icon: 'error' });
      this.setData({ generatingCode: false });
    }
  },

  /** 更新开门码过期倒计时 */
  updateCodeExpire() {
    const order = this.data.order;
    if (!order || !order.doorCodeExpire) return;

    const expireTime = new Date(order.doorCodeExpire).getTime();
    const now = Date.now();
    const remaining = Math.max(0, Math.floor((expireTime - now) / 1000));

    if (remaining <= 0) {
      this.setData({
        doorCodeExpired: true,
        doorCodeExpireText: '已过期',
      });
    } else {
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      this.setData({
        doorCodeExpired: false,
        doorCodeExpireText: `${m}分${s}秒后过期`,
      });
    }
  },

  // ─── 进行中计时 ───

  /** 启动计时器 */
  startUsingTimer(order) {
    const update = () => {
      const now = new Date();
      const mins = diffMinutes(order.startTime, now);
      this.setData({
        elapsedText: formatDuration(mins),
        estimatedAmount: this.calcEstimate(mins, order),
      });
    };
    update();
    const timer = setInterval(update, 10000); // 每 10 秒更新
    this.setData({ usingTimer: timer });
  },

  /** 计算预估费用（分） */
  calcEstimate(mins, order) {
    const hours = Math.ceil(mins / 60);
    return order.amount > 0
      ? Math.round((order.amount / 4) * hours) // 粗略：amount 是 4 小时的费用
      : hours * 100;                          // 兜底：$1/时
  },

  // ─── 操作 ───

  /** 结束使用 */
  async onFinish() {
    wx.showModal({
      title: '确认结束',
      content: '结束后将计算实际使用费用，多退少补。确认结束？',
      success: async (modalRes) => {
        if (!modalRes.confirm) return;

        wx.showLoading({ title: '结算中...' });
        const res = await callFunction('finishOrder', { orderId: this.data.orderId });
        wx.hideLoading();

        if (res.code === 0) {
          this.clearAllTimers();
          this.setData({
            showSettleModal: true,
            settleResult: res.data,
          });
        } else {
          wx.showToast({ title: res.msg, icon: 'error' });
        }
      },
    });
  },

  /** 关闭结算弹窗 */
  onCloseSettleModal() {
    this.setData({ showSettleModal: false });
    this.loadOrder(); // 刷新订单
  },

  /** 取消订单 */
  async onCancel() {
    wx.showModal({
      title: '确认取消',
      content: this.data.order.status === 'paid'
        ? '已支付的款项将退回余额。确认取消？'
        : '确认取消该订单？',
      success: async (modalRes) => {
        if (!modalRes.confirm) return;

        wx.showLoading({ title: '取消中...' });
        const res = await callFunction('cancelOrder', { orderId: this.data.orderId });
        wx.hideLoading();

        if (res.code === 0) {
          wx.showToast({ title: res.msg, icon: 'success' });
          setTimeout(() => this.loadOrder(), 1000);
        } else {
          wx.showToast({ title: res.msg, icon: 'error' });
        }
      },
    });
  },

  /** 去支付 */
  async onPay() {
    wx.showLoading({ title: '支付中...' });
    const res = await callFunction('payOrder', { orderId: this.data.orderId });
    wx.hideLoading();

    if (res.code === 0) {
      wx.showToast({ title: '支付成功', icon: 'success' });
      // 引导用户订阅消息通知
      this.requestSubscribe();
      this.loadOrder();
    } else {
      wx.showToast({ title: res.msg, icon: 'error' });
    }
  },

  /** 请求订阅消息授权 */
  requestSubscribe() {
    // 模版 ID 需要在微信公众平台申请后替换
    const tmplIds = [
      // 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // 支付成功通知
      // 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // 开台提醒
      // 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // 消费完成通知
    ];
    // 如果未配置模板 ID，跳过授权
    if (tmplIds.length === 0 || tmplIds[0].startsWith('x')) return;

    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => {
        // 记录用户授权状态，后续云函数发送时检查
        console.log('订阅消息授权结果:', res);
      },
      fail: (err) => {
        console.log('订阅消息授权失败（用户拒绝或关闭）:', err);
      },
    });
  },

  /** 去评价 */
  onReview() {
    wx.navigateTo({
      url: `/pages/review/review?orderId=${this.data.orderId}&storeId=${this.data.order.storeId}`,
    });
  },

  /** 返回 */
  onBack() {
    wx.navigateBack();
  },
});
