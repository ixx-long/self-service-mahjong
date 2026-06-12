// 写评价页
const { callFunction } = require('../../utils/cloud');
const { uploadImage } = require('../../utils/cloud');

Page({
  data: {
    orderId: '',
    storeId: '',
    rating: 0,
    content: '',
    images: [],       // 本地临时路径
    uploading: false,
    submitting: false,
  },

  onLoad(options) {
    const { orderId, storeId } = options;
    if (!orderId) { wx.navigateBack(); return; }
    this.setData({ orderId, storeId });
  },

  onRatingChange(e) {
    this.setData({ rating: e.detail.value });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  /** 选择图片 */
  onChooseImage() {
    const remain = 3 - this.data.images.length;
    if (remain <= 0) { wx.showToast({ title: '最多上传3张', icon: 'none' }); return; }

    wx.chooseImage({
      count: remain,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({ images: [...this.data.images, ...res.tempFilePaths] });
      },
    });
  },

  /** 移除图片 */
  onRemoveImage(e) {
    const idx = e.currentTarget.dataset.index;
    const images = [...this.data.images];
    images.splice(idx, 1);
    this.setData({ images });
  },

  /** 提交评价 */
  async onSubmit() {
    if (this.data.rating === 0) { wx.showToast({ title: '请给个评分', icon: 'none' }); return; }
    if (this.data.submitting) return;

    this.setData({ submitting: true, uploading: true });

    try {
      // 先上传图片
      const imageIds = [];
      for (const path of this.data.images) {
        try {
          const fileID = await uploadImage(path, 'reviews');
          imageIds.push(fileID);
        } catch (e) {
          console.warn('图片上传失败:', e);
        }
      }

      this.setData({ uploading: false });

      // 提交评价
      const res = await callFunction('submitReview', {
        orderId: this.data.orderId,
        rating: this.data.rating,
        content: this.data.content,
        images: imageIds,
      });

      if (res.code === 0) {
        wx.showToast({ title: '评价成功！', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1200);
      } else {
        wx.showToast({ title: res.msg, icon: 'error' });
        this.setData({ submitting: false });
      }
    } catch (err) {
      console.error('提交评价失败:', err);
      wx.showToast({ title: '提交失败', icon: 'error' });
      this.setData({ submitting: false, uploading: false });
    }
  },
});
