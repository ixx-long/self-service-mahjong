// 桌位管理
const app = getApp();
const { callFunction } = require('../../../utils/cloud');

Page({
  data: {
    stores: [], selectedStoreId: '', selectedStoreName: '请先创建门店', tables: [], loading: true,
    showForm: false, editingTable: null,
    form: { storeId: '', tableNo: '', type: 'auto', hourlyPrice: 100, status: 'idle' },
  },

  onLoad() {
    if (!app.checkAdmin()) { wx.navigateBack(); return; }
    this.loadStores();
  },

  async loadStores() {
    const db = wx.cloud.database();
    const res = await db.collection('stores').where({ status: 'open' }).get();
    this.setData({ stores: res.data || [] });
    if (res.data && res.data.length > 0) {
      const first = res.data[0];
      this.setData({ selectedStoreId: first._id, selectedStoreName: first.name });
      this.loadTables(first._id);
    } else {
      this.setData({ loading: false });
    }
  },

  onStoreChange(e) {
    const store = this.data.stores[e.detail.value];
    this.setData({ selectedStoreId: store._id, selectedStoreName: store.name });
    this.loadTables(store._id);
  },

  async loadTables(storeId) {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    const res = await db.collection('tables').where({ storeId }).orderBy('tableNo', 'asc').get();
    this.setData({ tables: res.data || [], loading: false });
  },

  onAdd() {
    this.setData({
      showForm: true, editingTable: null,
      form: { storeId: this.data.selectedStoreId, tableNo: '', type: 'auto', hourlyPrice: 100, status: 'idle' },
    });
  },

  onEdit(e) {
    const t = this.data.tables.find(t => t._id === e.currentTarget.dataset.id);
    if (t) this.setData({ showForm: true, editingTable: t, form: { storeId: t.storeId, tableNo: t.tableNo, type: t.type, hourlyPrice: t.hourlyPrice, status: t.status } });
  },

  async onDelete(e) {
    const id = e.currentTarget.dataset.id;
    const r = await new Promise(resolve => wx.showModal({ title: '确认删除', content: '删除后不可恢复', success: res => resolve(res.confirm) }));
    if (!r) return;
    await callFunction('adminManage', { action: 'manageTable', payload: { op: 'delete', data: { _id: id, storeId: this.data.selectedStoreId } } });
    wx.showToast({ title: '已删除', icon: 'success' });
    this.loadTables(this.data.selectedStoreId);
  },

  onFormInput(e) { const { field } = e.currentTarget.dataset; this.setData({ [`form.${field}`]: e.detail.value }); },

  async onSave() {
    const { form, editingTable } = this.data;
    if (!form.tableNo) { wx.showToast({ title: '桌号必填', icon: 'none' }); return; }
    const op = editingTable ? 'update' : 'add';
    const data = { ...form };
    if (editingTable) data._id = editingTable._id;
    const res = await callFunction('adminManage', { action: 'manageTable', payload: { op, data } });
    if (res.code === 0) {
      wx.showToast({ title: editingTable ? '已更新' : '已创建', icon: 'success' });
      this.setData({ showForm: false });
      this.loadTables(this.data.selectedStoreId);
    } else { wx.showToast({ title: res.msg, icon: 'error' }); }
  },

  onCloseForm() { this.setData({ showForm: false }); },
});
