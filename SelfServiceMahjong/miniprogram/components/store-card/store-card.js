// 门店卡片组件
Component({
  properties: {
    store: { type: Object, value: {} },
    distanceText: { type: String, value: '' },
    freeCount: { type: Number, value: 0 },
    tablesCount: { type: Number, value: 0 },
  },

  data: {
    freePercent: 0,
  },

  observers: {
    'freeCount, tablesCount'(free, total) {
      const pct = total > 0 ? Math.round((free / total) * 100) : 0;
      this.setData({ freePercent: pct });
    },
  },

  methods: {
    onTap() {
      const storeId = this.properties.store._id;
      console.log('store-card点击, storeId:', storeId);
      this.triggerEvent('tap', { storeId });
    },
  },
});
