// 客服消息管理（管理端）—— 会话列表 + 聊天
const app = getApp();
const { callFunction } = require('../../../utils/cloud');
const { formatTime } = require('../../../utils/util');

Page({
  data: {
    // 会话列表
    sessions: [],
    loading: true,
    // 聊天
    activeOpenId: '',
    messages: [],
    inputText: '',
    sending: false,
    scrollToView: '',
  },

  onLoad() {
    if (!app.checkAdmin()) { wx.navigateBack(); return; }
    this.loadSessions();
    this.pollTimer = setInterval(() => {
      if (this.data.activeOpenId) this.pollMessages();
    }, 5000);
  },

  onUnload() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  },

  /** 加载会话列表（按用户分组取最近消息） */
  async loadSessions() {
    this.setData({ loading: true });
    try {
      // 获取所有客服消息，按用户分组
      const db = wx.cloud.database();
      const res = await db.collection('service_messages')
        .orderBy('createTime', 'desc')
        .limit(100)
        .get();

      // 按 _openid 分组取最新
      const groupMap = {};
      (res.data || []).forEach(m => {
        if (!groupMap[m._openid]) {
          groupMap[m._openid] = {
            openId: m._openid,
            lastContent: (m.content || '').slice(0, 30),
            lastTime: m.createTime,
            from: m.from,
          };
        }
      });

      this.setData({ sessions: Object.values(groupMap), loading: false });
    } catch (err) {
      this.setData({ loading: false });
    }
  },

  /** 进入某用户聊天 */
  async onOpenChat(e) {
    const openId = e.currentTarget.dataset.openid;
    this.setData({ activeOpenId: openId });
    await this.loadChatMessages(openId);
  },

  /** 加载聊天消息 */
  async loadChatMessages(openId) {
    const res = await callFunction('getServiceMessages', { targetOpenId: openId });
    if (res.code === 0) {
      const messages = (res.data.messages || []).map(m => ({
        ...m, timeText: formatTime(m.createTime, 'HH:mm'),
      }));
      this.setData({ messages });
      this.scrollToBottom();
    }
  },

  async pollMessages() {
    await this.loadChatMessages(this.data.activeOpenId);
  },

  onInput(e) { this.setData({ inputText: e.detail.value }); },

  async onSend() {
    const text = this.data.inputText.trim();
    if (!text || this.data.sending) return;
    this.setData({ sending: true });
    const res = await callFunction('sendServiceMessage', { content: text, type: 'text' });
    if (res.code === 0) {
      this.setData({ inputText: '' });
      await this.loadChatMessages(this.data.activeOpenId);
      await this.loadSessions();
    } else {
      wx.showToast({ title: res.msg, icon: 'error' });
    }
    this.setData({ sending: false });
  },

  onBackToSessions() { this.setData({ activeOpenId: '', messages: [] }); },

  scrollToBottom() {
    const msgs = this.data.messages;
    if (msgs.length > 0) {
      this.setData({ scrollToView: `msg-${msgs.length - 1}` });
    }
  },
});
