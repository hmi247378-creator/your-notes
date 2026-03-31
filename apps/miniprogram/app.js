const TOKEN_KEY = 'YN_TOKEN';
const API_BASE_KEY = 'YN_API_BASE_URL';

App({
  globalData: {
    apiBaseUrl: 'http://10.10.232.146:3001/api',
    token: ''
  },
  onLaunch() {
    const apiBaseUrl = wx.getStorageSync(API_BASE_KEY) || '';
    if (apiBaseUrl) {
      this.globalData.apiBaseUrl = apiBaseUrl;
    }
  }
});
