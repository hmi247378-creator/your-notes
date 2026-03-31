const { request } = require('../../utils/api');

const PREVIEW_KEY = 'YN_PREVIEW_ITEMS';

function flattenLeafTags(nodes, out) {
  for (const n of nodes || []) {
    if (!n) continue;
    if (n.children && n.children.length) flattenLeafTags(n.children, out);
    else out.push(n);
  }
  return out;
}

function tagLabel(tag) {
  return (tag.path || tag.name || '').replace(/\./g, '-');
}

Page({
  data: {
    items: [],
    selectedTagIds: [],
    selectedTagNames: [],
    tagMap: {},
    leafTags: [],
    recordedAt: '',
    saving: false
  },

  async onShow() {
    const stored = wx.getStorageSync(PREVIEW_KEY) || null;
    if (!stored || !stored.items || !stored.items.length) {
      wx.navigateBack();
      return;
    }
    const items = stored.items || [];
    const selectedTagIds = items.map((it) => (it.tagIds && it.tagIds.length ? it.tagIds[0] : ''));
    this.setData({ items, selectedTagIds, recordedAt: stored.recordedAt || '' });

    try {
      const tree = await request('/tags/tree', { method: 'GET' });
      const leaf = flattenLeafTags(tree.tags || [], []);
      const tagMap = {};
      for (const t of leaf) tagMap[t.id] = tagLabel(t);
      const selectedTagNames = selectedTagIds.map((id) => (id && tagMap[id] ? tagMap[id] : ''));
      this.setData({ leafTags: leaf, tagMap, selectedTagNames });
    } catch {
      this.setData({ leafTags: [], tagMap: {}, selectedTagNames: [] });
    }
  },

  onEditText(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const value = e.detail.value;
    const items = this.data.items.slice();
    items[idx] = { ...items[idx], text: value };
    this.setData({ items });
  },

  onPickTag(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const tags = this.data.leafTags || [];
    if (!tags.length) {
      wx.showToast({ title: '暂无标签，请先在 Web 端创建', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: tags.map((t) => tagLabel(t)),
      success: (res) => {
        const pick = tags[res.tapIndex];
        const selectedTagIds = this.data.selectedTagIds.slice();
        const selectedTagNames = this.data.selectedTagNames.slice();
        selectedTagIds[idx] = pick.id;
        selectedTagNames[idx] = tagLabel(pick);
        this.setData({ selectedTagIds, selectedTagNames });
      }
    });
  },

  async onConfirm() {
    if (this.data.saving) return;
    const items = (this.data.items || []).map((it, i) => ({
      text: String(it.text || '').trim(),
      tagIds: this.data.selectedTagIds[i] ? [this.data.selectedTagIds[i]] : []
    }));
    if (items.some((x) => !x.text)) {
      wx.showToast({ title: '内容不能为空', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      await request('/notes/ingest/confirm', {
        method: 'POST',
        data: { items, source: 'miniprogram', recordedAt: this.data.recordedAt || undefined }
      });
      wx.removeStorageSync(PREVIEW_KEY);
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/list/list' });
      }, 300);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  onClose() {
    wx.navigateBack();
  }
});
