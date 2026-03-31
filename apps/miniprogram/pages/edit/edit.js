const { request } = require('../../utils/api');

Page({
  data: {
    id: '',
    text: '',
    dateVal: '',
    loading: false,
    saving: false
  },

  onLoad(query) {
    const id = query && query.id ? query.id : '';
    const tagId = query && query.tagId ? query.tagId : '';
    
    this.setData({ 
      id, 
      tagId,
      dateVal: this.getTodayStr()
    });

    if (id) {
      wx.setNavigationBarTitle({ title: '编辑笔记' });
      this.loadDetail();
    } else {
      wx.setNavigationBarTitle({ title: '新建笔记' });
    }
  },

  getTodayStr() {
    const day = new Date();
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, '0');
    const dd = String(day.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const note = await request('/notes/' + this.data.id, { method: 'GET' });
      const d = note.recordedAt || note.createdAt;
      const day = d ? new Date(d) : new Date();
      const y = day.getFullYear();
      const m = String(day.getMonth() + 1).padStart(2, '0');
      const dd = String(day.getDate()).padStart(2, '0');
      let content = note.contentMarkdown || note.contentPlain || note.contentPreview || '';
      if (typeof content !== 'string') content = String(content);
      
      this.setData({
        text: content,
        dateVal: `${y}-${m}-${dd}`
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
    } finally {
      this.setData({ loading: false });
    }
  },

  onText(e) {
    this.setData({ text: e.detail.value });
  },

  onDateChange(e) {
    this.setData({ dateVal: e.detail.value });
  },

  async onSave() {
    if (this.data.saving) return;
    const text = (this.data.text || '').trim();
    if (!text) {
      wx.showToast({ title: '内容不能为空', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      const payload = { contentMarkdown: text };
      if (this.data.dateVal) {
        payload.recordedAt = this.data.dateVal + 'T00:00:00';
      }

      if (this.data.id) {
        // Update existing
        await request('/notes/' + this.data.id, { method: 'PATCH', data: payload });
      } else {
        // Create new
        const createPayload = {
          ...payload,
          tagIds: this.data.tagId ? [this.data.tagId] : [],
          source: 'miniprogram'
        };
        await request('/api/notes', { method: 'POST', data: createPayload });
      }

      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  }
});

