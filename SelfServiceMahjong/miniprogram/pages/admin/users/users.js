// 用户管理
const app = getApp();
const { callFunction } = require('../../../utils/cloud');
const { maskPhone } = require('../../../utils/util');

Page({
  data: {
    users: [], keyword: '', loading: true, page: 1, hasMore: false,
  },

  onLoad() {
    if (!app.checkAdmin()) { wx.navigateBack(); return; }
    this.loadUsers();
  },

  async loadUsers(reset = true) {
    const page = reset ? 1 : this.data.page;
    if (reset) this.setData({ loading: true });

    const res = await callFunction('adminManage', {
      action: 'getUserList',
      payload: { page, keyword: this.data.keyword },
    });

    if (res.code === 0) {
      const users = (res.data.users || []).map(u => ({
        ...u, phoneMasked: maskPhone(u.phone),
      }));
      this.setData({
        users: reset ? users : [...this.data.users, ...users],
        loading: false, page, hasMore: res.data.hasMore,
      });
    }
  },

  onSearchInput(e) { this.setData({ keyword: e.detail.value }); },
  onSearch() { this.loadUsers(true); },

  async onToggleBlock(e) {
    const { id, blocked } = e.currentTarget.dataset;
    const label = blocked ? '解封' : '拉黑';
    const r = await new Promise(r => wx.showModal({
      title: `确认${label}`,
      content: `确定要${label}该用户吗？`,
      success: res => r(res.confirm),
    }));
    if (!r) return;

    const res = await callFunction('adminManage', {
      action: 'blockUser',
      payload: { userId: id, isBlocked: !blocked },
    });
    wx.showToast({ title: res.msg, icon: res.code === 0 ? 'success' : 'error' });
    if (res.code === 0) this.loadUsers(true);
  },

  loadMore() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadUsers(false);
    }
  },
});
