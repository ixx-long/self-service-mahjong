// 门店管理
const app = getApp();
const { callFunction } = require('../../../utils/cloud');

Page({
  data: {
    stores: [],
    loading: true,
    showForm: false,
    editingStore: null,
    locationDisplay: '',
    form: { name: '', address: '', phone: '', openTime: '10:00', closeTime: '02:00', location: { coordinates: [116.4074, 39.9042] } },
  },

  async onLoad() {
    if (!app.checkAdmin()) { wx.navigateBack(); return; }
    try {
      const pos = await app.getLocation();
      this.setData({ defaultLng: pos.longitude, defaultLat: pos.latitude });
    } catch (e) {
      this.setData({ defaultLng: 116.4074, defaultLat: 39.9042 });
    }
    this.loadStores();
  },

  async loadStores() {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    const res = await db.collection('stores').orderBy('createTime', 'desc').get();
    this.setData({ stores: res.data || [], loading: false });
  },

  /** 根据坐标生成显示字符串 */
  fmtLocation(coords) {
    return coords[1].toFixed(4) + ', ' + coords[0].toFixed(4);
  },

  onAdd() {
    const lng = this.data.defaultLng || 116.4074;
    const lat = this.data.defaultLat || 39.9042;
    const coords = [lng, lat];
    this.setData({
      showForm: true, editingStore: null,
      locationDisplay: this.fmtLocation(coords),
      form: { name: '', address: '', phone: '', openTime: '10:00', closeTime: '02:00', location: { coordinates: coords } },
    });
  },

  onEdit(e) {
    const store = this.data.stores.find(s => s._id === e.currentTarget.dataset.id);
    if (store) {
      const coords = store.location && store.location.coordinates ? store.location.coordinates : [this.data.defaultLng || 116.4074, this.data.defaultLat || 39.9042];
      this.setData({
        showForm: true,
        editingStore: store,
        locationDisplay: this.fmtLocation(coords),
        form: {
          name: store.name, address: store.address, phone: store.phone || '',
          openTime: store.openTime, closeTime: store.closeTime,
          location: { coordinates: [coords[0], coords[1]] },
        },
      });
    }
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认关闭',
      content: '关闭后该门店将不对外展示',
      success: async (res) => {
        if (!res.confirm) return;
        await callFunction('adminManage', { action: 'manageStore', payload: { op: 'delete', data: { _id: id } } });
        wx.showToast({ title: '已关闭', icon: 'success' });
        this.loadStores();
      },
    });
  },

  onFormInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  /** 地图选点 */
  onChooseLocation() {
    const that = this;
    wx.chooseLocation({
      success(res) {
        if (res.name) {
          that.setData({ 'form.name': res.name });
        }
        if (res.address) {
          that.setData({ 'form.address': res.address });
        }
        const coords = [res.longitude, res.latitude];
        that.setData({
          'form.location': { coordinates: coords },
          locationDisplay: that.fmtLocation(coords),
        });
      },
    });
  },

  async onSave() {
    const { form, editingStore } = this.data;
    if (!form.name || !form.address) { wx.showToast({ title: '名称和地址必填', icon: 'none' }); return; }

    const payload = {
      ...form,
      location: {
        lng: form.location.coordinates[0],
        lat: form.location.coordinates[1],
      },
    };

    const op = editingStore ? 'update' : 'add';
    if (editingStore) payload._id = editingStore._id;

    const res = await callFunction('adminManage', { action: 'manageStore', payload: { op, data: payload } });
    if (res.code === 0) {
      wx.showToast({ title: editingStore ? '已更新' : '已创建', icon: 'success' });
      this.setData({ showForm: false });
      this.loadStores();
    } else {
      wx.showToast({ title: res.msg, icon: 'error' });
    }
  },

  onCloseForm() { this.setData({ showForm: false }); },
});
