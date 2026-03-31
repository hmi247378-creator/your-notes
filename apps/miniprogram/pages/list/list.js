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
    items: [],
    loading: false,
    tagMap: {},
    tagOptions: [],
    selectedTagId: '',
    selectedTagIndex: 0,
    dateFrom: '',
    dateTo: ''
  },

  async onShow() {
    await this.loadTags();
    this.refresh();
  },

  back() {
    wx.navigateBack();
  },

  async loadTags() {
    try {
      const tree = await request('/tags/tree', { method: 'GET' });
      const tagMap = flattenTags(tree.tags || [], {}, '');
      const tagOptions = [{ id: '', label: '全部标签' }].concat(
        Object.keys(tagMap).map((id) => ({ id, label: tagMap[id] }))
      );
      this.setData({ tagMap, tagOptions, selectedTagId: '', selectedTagIndex: 0 });
    } catch {
      this.setData({ tagMap: {} });
    }
  },

  async refresh() {
    this.setData({ loading: true });
    try {
      const params = ['page=1', 'pageSize=50'];
      if (this.data.selectedTagId) {
        params.push('tagIds=' + encodeURIComponent(this.data.selectedTagId));
      }
      if (this.data.dateFrom) params.push('from=' + encodeURIComponent(this.data.dateFrom));
      if (this.data.dateTo) params.push('to=' + encodeURIComponent(this.data.dateTo));
      params.push('dateField=recordedAt');
      params.push('sortBy=recordedAt');
      params.push('sortOrder=desc');
      const query = '?' + params.join('&');
      const data = await request('/notes' + query, { method: 'GET' });
      const items = (data.items || []).map((x) => {
        const created = new Date(x.createdAt);
        const recordDate = new Date(x.recordedAt || x.createdAt);
        const recordDay = recordDate.toISOString().slice(0, 10);
        const full = String(x.contentPreview || '');
        const firstLine = full.split(/\r?\n/)[0] || '';
        const title = firstLine.length > 20 ? firstLine.slice(0, 20) + '…' : firstLine;
        const tagsText = (x.tagIds || [])
          .map((id) => this.data.tagMap[id] || id)
          .filter(Boolean)
          .join('；');
        return {
          ...x,
          createdAt: created.toLocaleString(),
          recordDate: recordDay,
          title,
          tagsText
        };
      });
      this.setData({ items });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/edit/edit?id=' + encodeURIComponent(id) });
  },

  async onDelete(e) {
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
          this.refresh();
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
        }
      }
    });
  },

  onPickTag(e) {
    const idx = Number(e.detail.value);
    const opts = this.data.tagOptions || [];
    const opt = opts[idx] || { id: '' };
    this.setData(
      {
        selectedTagIndex: idx,
        selectedTagId: opt.id || ''
      },
      () => {
        this.refresh();
      }
    );
  },

  onDateFrom(e) {
    this.setData({ dateFrom: e.detail.value }, () => this.refresh());
  },

  onDateTo(e) {
    this.setData({ dateTo: e.detail.value }, () => this.refresh());
  },

  goHome() {
    wx.reLaunch({ url: '/pages/notes/notes' });
  },
  goList() {
    // 当前页
  },
  goTags() {
    wx.reLaunch({ url: '/pages/tags/tags' });
  },
  goStats() {
    wx.reLaunch({ url: '/pages/stats/stats' });
  }
});
