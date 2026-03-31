const { request } = require('../../utils/api');

function flattenTags(nodes, out, prefix) {
  for (const n of nodes || []) {
    const path = prefix ? prefix + ' > ' + n.name : n.name;
    out[n.id] = path;
    if (n.children && n.children.length) flattenTags(n.children, out, path);
  }
  return out;
}

Page({
  data: {
    loading: false,
    totalNotes: 0,
    tagMap: {},
    tagCounts: [],
    recentDays: [],
    maxDayCount: 0,
    showQuickModal: false,
    modalText: '',
    modalSaving: false,
    userInitial: ''
  },

  async onShow() {
    const name = wx.getStorageSync('YN_USER_NAME') || '';
    const initial = name ? name[0] : '你';
    this.setData({ userInitial: initial });
    this.refresh();
  },

  async refresh() {
    this.setData({ loading: true });
    try {
      const [tree, countsRes, notesRes] = await Promise.all([
        request('/tags/tree', { method: 'GET' }),
        request('/notes/tag-counts?dateField=recordedAt', { method: 'GET' }),
        request('/notes?page=1&pageSize=100&sortBy=recordedAt&sortOrder=desc', { method: 'GET' })
      ]);
      const tagMap = flattenTags(tree.tags || [], {}, '');
      const counts = countsRes.counts || {};
      const tagCounts = Object.keys(counts)
        .map((id) => ({
          id,
          name: tagMap[id] || id,
          value: counts[id]
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);

      const items = notesRes.items || [];
      const byDay = {};
      items.forEach((n) => {
        const d = new Date(n.recordedAt || n.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate()
        ).padStart(2, '0')}`;
        byDay[key] = (byDay[key] || 0) + 1;
      });
      const days = Object.keys(byDay)
        .sort()
        .slice(-7)
        .map((day) => ({ day, count: byDay[day] }));

      const maxTagCount = tagCounts.reduce((m, t) => (t.value > m ? t.value : m), 0);
      const maxDayCount = days.reduce((m, d) => (d.count > m ? d.count : m), 0);
      const tagCountsWithPct = tagCounts.map((t) => ({
        ...t,
        percent: maxTagCount ? Math.round((t.value / maxTagCount) * 100) : 0
      }));
      const daysWithPct = days.map((d) => ({
        ...d,
        percent: maxDayCount ? Math.round((d.count / maxDayCount) * 100) : 0
      }));

      this.setData({
        tagMap,
        tagCounts: tagCountsWithPct,
        totalNotes: notesRes.total || items.length,
        recentDays: daysWithPct,
        maxTagCount,
        maxDayCount
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' });
  },
  goNotes() {
    wx.reLaunch({ url: '/pages/notes/notes' });
  },
  goTags() {
    wx.reLaunch({ url: '/pages/tags/tags' });
  },
  goStats() {
    // Current
  },
  goReminders() {
    wx.reLaunch({ url: '/pages/reminders/reminders' });
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
