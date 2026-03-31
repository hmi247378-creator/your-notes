const { request } = require('../../utils/api');

const TOKEN_KEY = 'YN_TOKEN';
const USER_NAME_KEY = 'YN_USER_NAME';

Page({
  data: {
    nickname: '',
    email: '',
    password: '',
    loading: false,
    error: ''
  },

  onNickname(e) {
    this.setData({ nickname: e.detail.value });
  },

  onEmail(e) {
    this.setData({ email: e.detail.value });
  },

  onPassword(e) {
    this.setData({ password: e.detail.value });
  },

  toLogin() {
    wx.navigateBack();
  },

  async onRegister() {
    this.setData({ loading: true, error: '' });
    try {
      const data = await request('/auth/register', {
        method: 'POST',
        data: { 
          nickname: this.data.nickname,
          email: this.data.email, 
          password: this.data.password 
        }
      });

      const token = data.token;
      if (!token) throw new Error('注册成功但未返回 token，请尝试登录');

      wx.setStorageSync(TOKEN_KEY, token);
      wx.setStorageSync(USER_NAME_KEY, (data.user && data.user.nickname) || this.data.nickname);
      
      const app = getApp();
      app.globalData.token = token;

      wx.showToast({ title: '欢迎您', icon: 'success' });
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/index/index' });
      }, 1500);
    } catch (e) {
      this.setData({ error: e && e.message ? e.message : '注册失败' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
