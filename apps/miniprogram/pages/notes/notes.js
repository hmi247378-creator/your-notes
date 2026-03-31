const { request } = require('../../utils/api');

const TOKEN_KEY = 'YN_TOKEN';
const USER_NAME_KEY = 'YN_USER_NAME';
const PREVIEW_KEY = 'YN_PREVIEW_ITEMS';

function ensureToken() {
  const token = wx.getStorageSync(TOKEN_KEY) || '';
  const app = getApp();
  app.globalData.token = token;
  return token;
}

function flattenTags(nodes, acc, prefix) {
  for (const n of nodes || []) {
    const path = prefix ? prefix + ' · ' + n.name : n.name;
    acc.push({ id: n.id, name: n.name, path, count: 0 });
    if (n.children && n.children.length) flattenTags(n.children, acc, path);
  }
  return acc;
}

Page({
  data: {
    loading: false,
    userName: '',
    userInitial: '',
    tags: [],
    selectedTagId: '',
    notes: [],
    total: 0,
    q: '',
    dateFrom: '',
    dateTo: '',
    dateFieldIndex: 0,
    dateFieldOptions: ['记录日期', '创建时间'],
    dateFieldValue: 'recordedAt',
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
    const name = wx.getStorageSync(USER_NAME_KEY) || '';
    const trimmed = String(name || '').trim();
    const initial = trimmed ? trimmed[0] : '你';
    this.setData({ userName: trimmed || '', userInitial: initial });
    this.refreshAll();
  },

  async refreshAll() {
    this.setData({ loading: true });
    try {
      await Promise.all([this.loadTags(), this.loadNotes()]);
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadTags() {
    try {
      const tree = await request('/tags/tree', { method: 'GET' });
      const flat = flattenTags(tree.tags || [], [], '');
      const countsResp = await request(
        '/notes/tag-counts?dateField=' + encodeURIComponent(this.data.dateFieldValue),
        { method: 'GET' }
      );
      const counts = countsResp.counts || {};
      const tags = flat.map((t) => ({
        ...t,
        count: counts[t.id] || 0
      }));
      this.setData({ tags });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '标签加载失败', icon: 'none' });
      this.setData({ tags: [] });
    }
  },

  async loadNotes() {
    try {
      const params = [];
      params.push('page=1');
      params.push('pageSize=50');
      if (this.data.q.trim()) params.push('q=' + encodeURIComponent(this.data.q.trim()));
      if (this.data.dateFrom) params.push('from=' + encodeURIComponent(this.data.dateFrom));
      if (this.data.dateTo) params.push('to=' + encodeURIComponent(this.data.dateTo));
      params.push('dateField=' + encodeURIComponent(this.data.dateFieldValue));
      params.push('sortBy=' + encodeURIComponent(this.data.dateFieldValue));
      params.push('sortOrder=desc');
      if (this.data.selectedTagId) params.push('tagIds=' + encodeURIComponent(this.data.selectedTagId));
      const query = '?' + params.join('&');
      const res = await request('/notes' + query, { method: 'GET' });
      const items = (res.items || []).map((x) => {
        const d = new Date(x.recordedAt || x.createdAt);
        const full = String(x.contentPreview || '');
        const firstLine = full.split(/\r?\n/)[0] || '';
        const title = firstLine.length > 20 ? firstLine.slice(0, 20) + '…' : firstLine;
        return {
          id: x.id,
          title,
          content: x.contentPreview,
          createdAt: new Date(x.createdAt).toLocaleString()
        };
      });
      this.setData({ notes: items, total: res.total || items.length });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '记录加载失败', icon: 'none' });
      this.setData({ notes: [], total: 0 });
    }
  },

  onSearchInput(e) {
    this.setData({ q: e.detail.value });
  },

  onSearchConfirm() {
    this.loadNotes();
  },

  onDateFrom(e) {
    this.setData({ dateFrom: e.detail.value }, () => this.loadNotes());
  },

  onDateTo(e) {
    this.setData({ dateTo: e.detail.value }, () => this.loadNotes());
  },

  onDateFieldChange(e) {
    const idx = Number(e.detail.value);
    const value = idx === 0 ? 'recordedAt' : 'createdAt';
    this.setData({ dateFieldIndex: idx, dateFieldValue: value }, () => {
      this.refreshAll();
    });
  },

  onClearFilter() {
    this.setData(
      {
        q: '',
        dateFrom: '',
        dateTo: ''
      },
      () => this.refreshAll()
    );
  },

  onSelectTag(e) {
    const id = e.currentTarget.dataset.id;
    const selected = this.data.selectedTagId === id ? '' : id;
    this.setData({ selectedTagId: selected }, () => this.refreshAll());
  },

  onOpenTags() {
    wx.navigateTo({ url: '/pages/tags/tags' });
  },

  onOpenQuickInput() {
    // 保留兼容，但首页已改为弹窗入口
    this.setData({ showQuickModal: true, modalText: '' });
  },

  onOpenQuickModal() {
    let name = '全部';
    if (this.data.selectedTagId) {
      const tag = (this.data.tags || []).find(t => t.id === this.data.selectedTagId);
      if (tag) name = tag.name;
    }
    this.setData({ 
      showQuickModal: true, 
      modalText: '', 
      modalSaving: false,
      selectedTagName: name
    });
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
      const payload = {
        contentMarkdown: text,
        tagIds: this.data.selectedTagId ? [this.data.selectedTagId] : [],
        source: 'miniprogram'
      };
      await request('/api/notes', { method: 'POST', data: payload });
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ showQuickModal: false, modalText: '' });
      this.refreshAll();
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
    } finally {
      this.setData({ modalSaving: false });
    }
  },

  onEditNote(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/edit/edit?id=' + encodeURIComponent(id) });
  },

  onDeleteNote(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条记录？删除后暂不支持恢复。',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await request('/notes/' + id, { method: 'DELETE' });
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadNotes();
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
        }
      }
    });
  },

  onOpenReminders() {
    wx.navigateTo({ url: '/pages/reminders/reminders' });
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' });
  },
  goReminders() {
    wx.reLaunch({ url: '/pages/reminders/reminders' });
  },
  goTags() {
    wx.reLaunch({ url: '/pages/tags/tags' });
  },
  goStats() {
    wx.reLaunch({ url: '/pages/stats/stats' });
  },
  goReminders() {
    wx.reLaunch({ url: '/pages/reminders/reminders' });
  }
});
