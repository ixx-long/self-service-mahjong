// 系统设置
const app = getApp();
const { callFunction } = require('../../../utils/cloud');

Page({
  data: {
    settings: [],
    loading: true,
    editingKey: '',
    editingValue: '',
    showEdit: false,
  },

  onLoad() {
    if (!app.checkAdmin()) { wx.navigateBack(); return; }
    this.loadSettings();
  },

  async loadSettings() {
    this.setData({ loading: true });
    const res = await callFunction('adminManage', { action: 'getSettings', payload: {} });
    if (res.code === 0) {
      this.setData({ settings: this.formatSettings(res.data || []), loading: false });
    } else {
      wx.showToast({ title: res.msg || '加载失败', icon: 'error' });
      this.setData({ loading: false });
    }
  },

  // 中文名映射
  zhNameMap: {
    adminOpenIds: '管理员列表',
    overTimeRate: '超时罚金倍率',
    doorCodeSecret: '开门码签名密钥',
    timeSlots: '预约时段列表',
    refundRate: '退款比率',
  },

  /** 为每个设置项生成中文名和显示值 */
  formatSettings(list) {
    const zhMap = this.zhNameMap;
    return list.map(item => {
      let displayValue;
      const v = item.value;
      if (Array.isArray(v)) {
        displayValue = '[' + v.length + '项]';
      } else if (typeof v === 'number') {
        displayValue = String(v);
      } else if (item.key === 'doorCodeSecret') {
        displayValue = '***已加密***';
      } else {
        displayValue = String(v || '').slice(0, 25);
      }
      return {
        ...item,
        zhName: zhMap[item.key] || item.key,
        displayValue,
      };
    });
  },

  onEdit(e) {
    const { key, value } = e.currentTarget.dataset;
    this.setData({
      showEdit: true,
      editingKey: key,
      editingZhName: this.zhNameMap[key] || key,
      editingValue: typeof value === 'object' ? JSON.stringify(value) : String(value),
    });
  },

  onValueInput(e) {
    this.setData({ editingValue: e.detail.value });
  },

  async onSave() {
    const { editingKey, editingValue } = this.data;

    // 尝试解析 JSON（如数组）
    let value = editingValue;
    try { value = JSON.parse(editingValue); } catch (e) { /* 保持字符串 */ }

    const res = await callFunction('adminManage', {
      action: 'updateSetting',
      payload: { key: editingKey, value },
    });

    if (res.code === 0) {
      wx.showToast({ title: '已更新', icon: 'success' });
      this.setData({ showEdit: false });
      this.loadSettings();
    } else {
      wx.showToast({ title: res.msg, icon: 'error' });
    }
  },

  onCloseEdit() { this.setData({ showEdit: false }); },
});
