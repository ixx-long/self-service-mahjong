// 在线客服（用户端）
const app = getApp();
const { callFunction } = require('../../utils/cloud');
const { formatTime } = require('../../utils/util');

Page({
  data: {
    messages: [],
    inputText: '',
    loading: true,
    sending: false,
    scrollToView: '',
  },

  onLoad() {
    this.loadMessages();
    // 每 5 秒轮询新消息
    this.pollTimer = setInterval(() => this.pollMessages(), 5000);
  },

  onUnload() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  },

  async loadMessages() {
    this.setData({ loading: true });
    const res = await callFunction('getServiceMessages', {});
    if (res.code === 0) {
      const messages = (res.data.messages || []).map(m => ({
        ...m,
        timeText: formatTime(m.createTime, 'HH:mm'),
      }));
      this.setData({ messages, loading: false });
      this.scrollToBottom();
    }
  },

  /** 轮询：增量获取新消息 */
  async pollMessages() {
    try {
      const res = await callFunction('getServiceMessages', {});
      if (res.code === 0 && res.data.messages) {
        const newMsgs = res.data.messages.map(m => ({
          ...m, timeText: formatTime(m.createTime, 'HH:mm'),
        }));
        if (newMsgs.length !== this.data.messages.length) {
          this.setData({ messages: newMsgs });
          this.scrollToBottom();
        }
      }
    } catch (e) { /* ignore polling errors */ }
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  /** 发送文本消息 */
  async onSend() {
    const text = this.data.inputText.trim();
    if (!text || this.data.sending) return;

    this.setData({ sending: true });

    const res = await callFunction('sendServiceMessage', { content: text, type: 'text' });

    if (res.code === 0) {
      this.setData({ inputText: '' });
      await this.loadMessages();
    } else {
      wx.showToast({ title: res.msg, icon: 'error' });
    }

    this.setData({ sending: false });
  },

  /** 发送图片消息 */
  async onSendImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        wx.showLoading({ title: '发送中...' });
        try {
          // 先上传图片
          const { uploadImage } = require('../../utils/cloud');
          const fileID = await uploadImage(res.tempFilePaths[0], 'service');
          const sendRes = await callFunction('sendServiceMessage', { content: fileID, type: 'image' });
          wx.hideLoading();
          if (sendRes.code === 0) {
            await this.loadMessages();
          } else {
            wx.showToast({ title: sendRes.msg, icon: 'error' });
          }
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: '发送失败', icon: 'error' });
        }
      },
    });
  },

  scrollToBottom() {
    const msgs = this.data.messages;
    if (msgs.length > 0) {
      this.setData({ scrollToView: `msg-${msgs[msgs.length - 1]._id || msgs.length - 1}` });
    }
  },
});
