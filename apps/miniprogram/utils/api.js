function getAppToken() {
  const app = getApp();
  return app && app.globalData ? app.globalData.token : '';
}

function apiBase() {
  const app = getApp();
  return (app && app.globalData && app.globalData.apiBaseUrl) || 'https://your-notes-worker.hmi247378.workers.dev/api';
}

function request(path, options) {
  return new Promise((resolve, reject) => {
    const tokenFromStorage = wx.getStorageSync('YN_TOKEN') || '';
    const token = tokenFromStorage || getAppToken();
    wx.request({
      url: apiBase() + path,
      method: options.method || 'GET',
      data: options.data || undefined,
      header: {
        'Content-Type': 'application/json',
        Authorization: token ? 'Bearer ' + token : ''
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data.data || res.data);
        } else {
          reject(new Error((res.data && res.data.error && res.data.error.message) || '请求失败'));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求故障'));
      }
    });
  });
}

module.exports = { request };
