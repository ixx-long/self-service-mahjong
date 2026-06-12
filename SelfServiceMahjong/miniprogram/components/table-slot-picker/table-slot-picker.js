// 桌位时段选择器组件
Component({
  properties: {
    table: { type: Object, value: {} },
    selectedTableId: { type: String, value: '' },
    selectedSlot: { type: String, value: '' },
  },

  methods: {
    onSlotTap(e) {
      const { slot, status } = e.currentTarget.dataset;
      if (status !== 'free') return;
      if (this.properties.table.status === 'maintenance') return;

      this.triggerEvent('select', {
        tableId: this.properties.table._id,
        slot,
      });
    },
  },
});
