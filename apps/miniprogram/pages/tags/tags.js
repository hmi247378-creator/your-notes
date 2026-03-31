const { request } = require('../../utils/api');

function flattenTree(nodes, depth, parentId, out) {
  for (const n of nodes || []) {
    const item = {
      id: n.id,
      name: n.name,
      depth,
      parentId: parentId || '',
    };
    out.push(item);
    if (n.children && n.children.length) flattenTree(n.children, depth + 1, n.id, out);
  }
  return out;
}

Page({
  data: {
    loading: false,
    tags: [],
    editingMode: '',
    editingTagId: '',
    editingParentId: '',
    editingName: '',
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    this.setData({ loading: true });
    try {
      const tree = await request('/tags/tree', { method: 'GET' });
      const flat = flattenTree(tree.tags || [], 0, '', []);
      this.setData({ tags: flat });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '标签加载失败', icon: 'none' });
      this.setData({ tags: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  startCreateRoot() {
    this.setData({
      editingMode: 'create-root',
      editingTagId: '',
      editingParentId: '',
      editingName: '',
    });
  },

  startCreateChild(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      editingMode: 'create-child',
      editingTagId: '',
      editingParentId: id,
      editingName: '',
    });
  },

  startRename(e) {
    const id = e.currentTarget.dataset.id;
    const tag = (this.data.tags || []).find((t) => t.id === id);
    if (!tag) return;
    this.setData({
      editingMode: 'rename',
      editingTagId: id,
      editingParentId: tag.parentId || '',
      editingName: tag.name,
    });
  },

  cancelEdit() {
    this.setData({
      editingMode: '',
      editingTagId: '',
      editingParentId: '',
      editingName: '',
    });
  },

  onEditNameInput(e) {
    this.setData({ editingName: e.detail.value });
  },

  async saveEdit() {
    const name = (this.data.editingName || '').trim();
    if (!name) {
      wx.showToast({ title: '名称不能为空', icon: 'none' });
      return;
    }
    try {
      if (this.data.editingMode === 'rename' && this.data.editingTagId) {
        await request('/tags/' + this.data.editingTagId, {
          method: 'PATCH',
          data: { name },
        });
      } else if (this.data.editingMode === 'create-root') {
        await request('/tags', {
          method: 'POST',
          data: { name },
        });
      } else if (this.data.editingMode === 'create-child' && this.data.editingParentId) {
        await request('/tags', {
          method: 'POST',
          data: { name, parentId: this.data.editingParentId },
        });
      }
      this.cancelEdit();
      this.refresh();
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
    }
  },

  async onDeleteTag(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '删除标签',
      content: '确定删除该标签？若有子标签或已关联记录，删除会被阻止。',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await request('/tags/' + id, { method: 'DELETE' });
          wx.showToast({ title: '已删除', icon: 'success' });
          this.refresh();
        } catch (e) {
          wx.showToast({ title: (e && e.message) || '删除失败', icon: 'none' });
        }
      },
    });
  },

  onTagsDeleteHint() {
    wx.showToast({ title: '点击具体标签右侧的删除即可删除', icon: 'none' });
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
  }
});
