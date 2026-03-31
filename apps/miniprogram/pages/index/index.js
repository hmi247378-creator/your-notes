const { request } = require('../../utils/api');

const TOKEN_KEY = 'YN_TOKEN';
const PREVIEW_KEY = 'YN_PREVIEW_ITEMS';

function ensureToken() {
  const token = wx.getStorageSync(TOKEN_KEY) || '';
  const app = getApp();
  app.globalData.token = token;
  return token;
}

function looksEnumerated(raw) {
  const lines = String(raw || '').split(/\r?\n/).map((l) => l.trim());
  const pattern = /^(\d+[\.\)\）、，,．]|[-*•·])\s*/;
  let count = 0;
  for (const l of lines) {
    if (!l) continue;
    if (pattern.test(l)) count += 1;
  }
  return count >= 2;
}

Page({
  data: {
    text: '',
    dateVal: '',
    timeVal: '',
    saving: false,
    total: 0,
    tags: []
  },

  onShow() {
    const token = ensureToken();
    if (!token) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    this.setData({ dateVal: `${y}-${m}-${d}`, timeVal: `${hh}:${mm}` });
  },

  onInput(e) {
    this.setData({ text: e.detail.value });
  },

  onDateChange(e) {
    this.setData({ dateVal: e.detail.value });
  },

  onTimeChange(e) {
    this.setData({ timeVal: e.detail.value });
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' });
  },

  goNotes() {
    wx.reLaunch({ url: '/pages/notes/notes' });
  },

  goStats() {
    wx.reLaunch({ url: '/pages/stats/stats' });
  },

  goReminders() {
    wx.reLaunch({ url: '/pages/reminders/reminders' });
  },

  onOpenQuickInput() {
    // Removed
  },

  async onSmartAdapt() {
    const text = (this.data.text || '').trim();
    if (!text) return;
    this.setData({ saving: true });
    try {
      const single = !looksEnumerated(text);
      const data = await request('/notes/ingest/preview', {
        method: 'POST',
        data: { text, singleItem: single, smartSplit: !single }
      });
      const items = data.items || [];
      if (!items.length) throw new Error('未生成预览内容');
      wx.setStorageSync(PREVIEW_KEY, {
        items,
        recordedAt: this.data.dateVal && this.data.timeVal ? `${this.data.dateVal}T${this.data.timeVal}:00` : ''
      });
      wx.navigateTo({ url: '/pages/confirm/confirm' });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '适配失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  }
});
