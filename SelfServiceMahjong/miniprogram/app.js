// app.js —— 自助麻将馆小程序入口
App({
  /**
   * 小程序启动时执行
   */
  onLaunch() {
    // 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }
    wx.cloud.init({
      env: '请填入你的云环境ID',
      traceUser: true,
    });

    // 加载全局用户信息（异步，不阻塞启动）
    this.loadUserInfo().then(success => {
      if (!success) console.warn('首次登录未完成，将在首次使用时重试');
    });
  },

  /**
   * 全局数据
   */
  globalData: {
    userInfo: null,      // 用户信息（来自 users 集合）
    isAdmin: false,       // 是否管理员
    isLoggedIn: false,    // 是否已登录
    latitude: null,       // 用户当前纬度
    longitude: null,      // 用户当前经度
  },

  /**
   * 登录并获取用户信息
   * @returns {Promise<boolean>} 是否登录成功
   */
  async loadUserInfo() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getOpenId' });
      if (res.result && res.result.code === 0 && res.result.data) {
        const user = res.result.data;
        this.globalData.userInfo = user;
        this.globalData.isAdmin = user.role === 'admin';
        this.globalData.isLoggedIn = true;

        // 存储到本地缓存
        wx.setStorageSync('userInfo', user);
        wx.setStorageSync('isAdmin', user.role === 'admin');
        console.log('登录成功:', user._openid);
        return true;
      } else {
        console.warn('getOpenId 返回异常:', res.result);
        return false;
      }
    } catch (err) {
      console.error('登录失败:', err);
      return false;
    }
  },

  /**
   * 获取用户位置（需授权）
   * @returns {Promise<{latitude: number, longitude: number}>}
   */
  getLocation() {
    return new Promise((resolve, reject) => {
      // 优先使用缓存
      if (this.globalData.latitude && this.globalData.longitude) {
        resolve({
          latitude: this.globalData.latitude,
          longitude: this.globalData.longitude,
        });
        return;
      }

      wx.getLocation({
        type: 'gcj02',  // 国测局坐标，与云数据库 geo 查询一致
        success: (res) => {
          this.globalData.latitude = res.latitude;
          this.globalData.longitude = res.longitude;
          resolve(res);
        },
        fail: (err) => {
          // 用户拒绝授权，使用默认坐标（北京天安门）
          console.warn('获取位置失败，使用默认坐标:', err);
          const defaultPos = {
            latitude: 39.9042,
            longitude: 116.4074,
          };
          this.globalData.latitude = defaultPos.latitude;
          this.globalData.longitude = defaultPos.longitude;
          resolve(defaultPos);
        },
      });
    });
  },

  /**
   * 判断当前用户是否为管理员
   */
  checkAdmin() {
    return this.globalData.isAdmin;
  },
});
