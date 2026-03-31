const { request } = require('../../utils/api');

const TOKEN_KEY = 'YN_TOKEN';
const API_BASE_KEY = 'YN_API_BASE_URL';
const USER_NAME_KEY = 'YN_USER_NAME';

Page({
  data: {
    email: '',
    password: '',
    loading: false,
    error: '',
    apiBaseUrl: '',
    testing: false,
    showApi: false
  },

  onShow() {
    const app = getApp();
    const stored = wx.getStorageSync(API_BASE_KEY) || '';
    const apiBaseUrl = stored || app.globalData.apiBaseUrl;
    this.setData({ apiBaseUrl });
    app.globalData.apiBaseUrl = apiBaseUrl;
  },
  toggleApi() {
    this.setData({ showApi: !this.data.showApi });
  },

  onApiBaseUrl(e) {
    const v = (e.detail.value || '').trim();
    this.setData({ apiBaseUrl: v });
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.apiBaseUrl = v.replace(/\/+$/, '');
    }
  },

  onSaveApiBase() {
    const v = (this.data.apiBaseUrl || '').trim().replace(/\/+$/, '');
    if (!v) return;
    wx.setStorageSync(API_BASE_KEY, v);
    const app = getApp();
    app.globalData.apiBaseUrl = v;
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  async onTestApi() {
    if (this.data.testing) return;
    this.setData({ testing: true, error: '' });
    try {
      const r = await request('/health', { method: 'GET' });
      if (!r || !r.ok) throw new Error('接口未返回 ok=true');
      wx.showToast({ title: '连接成功', icon: 'success' });
    } catch (e) {
      const platform = (wx.getSystemInfoSync && wx.getSystemInfoSync().platform) || '';
      const hint =
        platform && platform !== 'devtools'
          ? '（真机请填电脑局域网IP，如 http://10.10.232.146:3001/api）'
          : '（可尝试 http://127.0.0.1:3001/api）';
      this.setData({ error: (e && e.message ? e.message : '连接失败') + hint });
    } finally {
      this.setData({ testing: false });
    }
  },

  onEmail(e) {
    this.setData({ email: e.detail.value });
  },

  onPassword(e) {
    this.setData({ password: e.detail.value });
  },

  async onLogin() {
    this.setData({ loading: true, error: '' });
    try {
      const data = await request('/auth/login', {
        method: 'POST',
        data: { email: this.data.email, password: this.data.password }
      });

      const token = data.token;
      if (!token) throw new Error('登录失败：未返回 token');

      wx.setStorageSync(TOKEN_KEY, token);
      wx.setStorageSync(USER_NAME_KEY, (data.user && data.user.nickname) || '');
      const app = getApp();
      app.globalData.token = token;

      wx.reLaunch({ url: '/pages/index/index' });
    } catch (e) {
      this.setData({ error: e && e.message ? e.message : '登录失败' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
