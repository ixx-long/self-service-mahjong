// 星级评分组件
Component({
  properties: {
    rating: { type: Number, value: 0 },         // 当前评分（0-5）
    max: { type: Number, value: 5 },              // 最大星数
    readonly: { type: Boolean, value: false },    // 是否只读
    size: { type: Number, value: 40 },            // 星星大小 rpx
  },

  data: {
    stars: [],
  },

  lifetimes: {
    attached() {
      this.buildStars();
    },
  },

  observers: {
    'rating'(val) {
      this.buildStars();
    },
  },

  methods: {
    buildStars() {
      const stars = [];
      for (let i = 1; i <= this.properties.max; i++) {
        if (i <= this.properties.rating) {
          stars.push('full');       // 实星
        } else if (i - 0.5 <= this.properties.rating) {
          stars.push('half');       // 半星（简化：不支持半星则用实星）
        } else {
          stars.push('empty');      // 空星
        }
      }
      this.setData({ stars });
    },

    onTap(e) {
      if (this.properties.readonly) return;
      const value = Number(e.currentTarget.dataset.value);
      this.setData({ rating: value });
      this.buildStars();
      this.triggerEvent('change', { value });
    },
  },
});
