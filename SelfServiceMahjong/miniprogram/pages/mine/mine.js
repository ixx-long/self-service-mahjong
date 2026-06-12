// 个人中心：用户信息、余额、功能入口、设置、管理端
const app = getApp();
const { callFunction } = require('../../utils/cloud');

Page({
  data: {
    userInfo: null,
    isAdmin: false,
    balance: 0,
    loggingIn: false,    // 是否正在登录中

    // 充值弹窗
    showTopUpModal: false,
    topUpAmount: '',

    // 编辑弹窗
    showEditModal: false,
    editField: '',       // 'nickName' | 'phone'
    editValue: '',
    editLabel: '',
  },

  onShow() {
    this.loadUserInfo();
    // 静默确保登录
    this.ensureLogin();
  },

  /** 从缓存/全局数据加载用户信息 */
  loadUserInfo() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    const isAdmin = app.globalData.isAdmin || wx.getStorageSync('isAdmin');

    if (userInfo) {
      this.setData({
        userInfo,
        isAdmin,
        balance: userInfo.balance || 0,
      });
      return true;
    }
    return false;
  },

  /** 确保已登录：如果没登过则调云函数登录 */
  async ensureLogin() {
    // 已有登录态，直接返回
    if (app.globalData.userInfo && app.globalData.userInfo._openid) return true;
    if (this.data.loggingIn) return false;

    this.setData({ loggingIn: true });
    try {
      const res = await callFunction('getOpenId');
      if (res.code === 0 && res.data) {
        const user = res.data;
        app.globalData.userInfo = user;
        app.globalData.isAdmin = user.role === 'admin';
        app.globalData.isLoggedIn = true;
        wx.setStorageSync('userInfo', user);
        wx.setStorageSync('isAdmin', user.role === 'admin');
        this.setData({
          userInfo: user,
          isAdmin: user.role === 'admin',
          balance: user.balance || 0,
          loggingIn: false,
        });
        return true;
      }
      console.error('登录失败:', res);
      this.setData({ loggingIn: false });
      return false;
    } catch (err) {
      console.error('登录异常:', err);
      this.setData({ loggingIn: false });
      return false;
    }
  },

  /** 模拟充值 */
  onTopUp() {
    this.setData({
      showTopUpModal: true,
      topUpAmount: '',
    });
  },

  onTopUpInput(e) {
    this.setData({ topUpAmount: e.detail.value });
  },

  async onConfirmTopUp() {
    const amount = parseFloat(this.data.topUpAmount);
    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }

    // 未登录则先登录
    if (!app.globalData.userInfo || !app.globalData.userInfo._openid) {
      wx.showLoading({ title: '登录中...' });
      const ok = await this.ensureLogin();
      wx.hideLoading();
      if (!ok) {
        wx.showToast({ title: '登录失败，请稍后重试', icon: 'none' });
        return;
      }
    }

    wx.showLoading({ title: '充值中...' });
    // 通过云函数充值，客户端无法直接修改余额
    const res = await callFunction('recharge', {
      targetOpenId: app.globalData.userInfo._openid,
      amount,
    });

    wx.hideLoading();
    if (res.code === 0) {
      const newBalance = res.data.newBalance;
      app.globalData.userInfo.balance = newBalance;
      wx.setStorageSync('userInfo', app.globalData.userInfo);
      this.setData({ balance: newBalance, showTopUpModal: false });
      wx.showToast({ title: `充值成功 ¥${amount}`, icon: 'success' });
    } else {
      wx.showToast({ title: res.msg || '充值失败', icon: 'none' });
    }
  },

  onCloseTopUpModal() {
    this.setData({ showTopUpModal: false });
  },

  // ─── 功能入口 ───

  /** 消费记录 → 订单列表 */
  onOrders() {
    wx.switchTab({ url: '/pages/orders/orders' });
  },

  /** 我的评价 */
  onMyReviews() {
    wx.navigateTo({ url: '/pages/myReviews/myReviews' });
  },

  /** 联系客服 */
  onService() {
    wx.navigateTo({ url: '/pages/service/service' });
  },

  /** 管理端入口 */
  onAdmin() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '无权限', icon: 'error' });
      return;
    }
    wx.navigateTo({ url: '/pages/admin/dashboard/dashboard' });
  },

  // ─── 设置 ───

  /** 编辑昵称 */
  onEditNick() {
    this.setData({
      showEditModal: true,
      editField: 'nickName',
      editLabel: '昵称',
      editValue: this.data.userInfo ? this.data.userInfo.nickName : '',
    });
  },

  /** 编辑手机号 */
  onEditPhone() {
    this.setData({
      showEditModal: true,
      editField: 'phone',
      editLabel: '手机号',
      editValue: this.data.userInfo ? this.data.userInfo.phone : '',
    });
  },

  onEditInput(e) {
    this.setData({ editValue: e.detail.value });
  },

  /** 确认编辑 */
  async onConfirmEdit() {
    const { editField, editValue, editLabel } = this.data;

    if (!editValue || !editValue.trim()) {
      wx.showToast({ title: `${editLabel}不能为空`, icon: 'none' });
      return;
    }

    if (editField === 'phone' && !/^1[3-9]\d{9}$/.test(editValue.trim())) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }

    // 未登录则先登录
    if (!app.globalData.userInfo || !app.globalData.userInfo._openid) {
      wx.showLoading({ title: '登录中...' });
      const ok = await this.ensureLogin();
      wx.hideLoading();
      if (!ok) {
        wx.showToast({ title: '登录失败，请稍后重试', icon: 'none' });
        return;
      }
    }

    wx.showLoading({ title: '保存中...' });
    try {
      const db = wx.cloud.database();
      const openid = app.globalData.userInfo._openid;
      const userRes = await db.collection('users').where({ _openid: openid }).get();

      if (userRes.data && userRes.data.length > 0) {
        await db.collection('users').doc(userRes.data[0]._id).update({
          data: { [editField]: editValue.trim() },
        });

        app.globalData.userInfo[editField] = editValue.trim();
        wx.setStorageSync('userInfo', app.globalData.userInfo);

        wx.hideLoading();
        this.setData({
          showEditModal: false,
          userInfo: app.globalData.userInfo,
        });
        wx.showToast({ title: '修改成功', icon: 'success' });
      } else {
        wx.hideLoading();
        wx.showToast({ title: '用户记录不存在，请重新进入', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('修改失败:', err);
      wx.showToast({ title: '修改失败: ' + (err.message || '未知错误'), icon: 'none' });
    }
  },

  onCloseEditModal() {
    this.setData({ showEditModal: false });
  },

  // ─── 退出登录 ───

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          app.globalData.userInfo = null;
          app.globalData.isAdmin = false;
          app.globalData.isLoggedIn = false;
          wx.clearStorageSync();
          wx.reLaunch({ url: '/pages/index/index' });
        }
      },
    });
  },
});
