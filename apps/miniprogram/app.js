const TOKEN_KEY = 'YN_TOKEN';
const API_BASE_KEY = 'YN_API_BASE_URL';

App({
  globalData: {
    apiBaseUrl: 'https://your-notes-worker.hmi247378.workers.dev/api',
    token: ''
  },
  onLaunch() {
    const apiBaseUrl = wx.getStorageSync(API_BASE_KEY) || '';
    if (apiBaseUrl) {
      this.globalData.apiBaseUrl = apiBaseUrl;
    }
  }
});
