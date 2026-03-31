const { request } = require('../../utils/api');

const TOKEN_KEY = 'YN_TOKEN';

function ensureToken() {
  const token = wx.getStorageSync(TOKEN_KEY) || '';
  const app = getApp();
  app.globalData.token = token;
  return token;
}

function formatDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

Page({
  data: {
    loading: false,
    items: [],
    q: '',
    statusOptions: ['全部', '待处理', '进行中', '已完成'],
    statusIndex: 0,
    showQuickModal: false,
    modalText: '',
    modalSaving: false
  },

  onShow() {
    const token = ensureToken();
    if (!token) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.refresh();
  },

  onSearchInput(e) {
    this.setData({ q: e.detail.value });
  },

  onSearchConfirm() {
    this.refresh();
  },

  onStatusChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ statusIndex: idx }, () => this.refresh());
  },

  async refresh() {
    this.setData({ loading: true });
    try {
      const params = ['page=1', 'pageSize=50'];
      if (this.data.q.trim()) params.push('q=' + encodeURIComponent(this.data.q.trim()));
      const status = this.data.statusOptions[this.data.statusIndex];
      if (status !== '全部') params.push('status=' + encodeURIComponent(status));
      const query = '?' + params.join('&');
      const res = await request('/reminders' + query, { method: 'GET' });
      const items = (res.items || []).map((r) => ({
        id: r.id,
        noteId: r.noteId,
        content: r.content,
        recordDate: formatDay(r.recordDate),
        status: r.status,
        remindDate: formatDay(r.remindAt),
        remindTime: formatTime(r.remindAt)
      }));
      this.setData({ items });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '提醒加载失败', icon: 'none' });
      this.setData({ items: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onMarkDone(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    try {
      await request('/reminders/' + id, {
        method: 'PATCH',
        data: { status: '已完成' }
      });
      wx.showToast({ title: '已完成', icon: 'success' });
      this.refresh();
    } catch (er) {
      wx.showToast({ title: (er && er.message) || '操作失败', icon: 'none' });
    }
  },

  onOpenNote(e) {
    const noteId = e.currentTarget.dataset.noteId;
    if (!noteId) return;
    wx.navigateTo({ url: '/pages/edit/edit?id=' + encodeURIComponent(noteId) });
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

  onOpenQuickModal() {
    this.setData({ showQuickModal: true, modalText: '', modalSaving: false });
  },

  onCloseQuickModal() {
    if (this.data.modalSaving) return;
    this.setData({ showQuickModal: false, modalText: '' });
  },

  onModalTextInput(e) {
    this.setData({ modalText: e.detail.value });
  },

  async onSubmitQuickModal() {
    if (this.data.modalSaving) return;
    const text = (this.data.modalText || '').trim();
    if (!text) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    this.setData({ modalSaving: true });
    try {
      const data = await request('/notes/ingest/preview', {
        method: 'POST',
        data: { text, singleItem: true, smartSplit: false }
      });
      const items = data.items || [];
      if (!items.length) throw new Error('未生成预览内容');
      wx.setStorageSync('YN_PREVIEW_ITEMS', {
        items,
        recordedAt: ''
      });
      this.setData({ showQuickModal: false, modalText: '' });
      wx.navigateTo({ url: '/pages/confirm/confirm' });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '适配失败', icon: 'none' });
    } finally {
      this.setData({ modalSaving: false });
    }
  }
});
