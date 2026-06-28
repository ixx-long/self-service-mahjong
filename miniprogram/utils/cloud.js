/**
 * 云开发初始化与云函数调用封装
 * 统一处理错误，返回结构化结果
 */

/** 调用指定云函数
 * @param {string} name - 云函数名称
 * @param {object} data - 传入参数
 * @param {object} options - 额外选项（如 { timeout: 15000 }）
 * @returns {Promise<{code: number, data: any, msg: string}>}
 */
async function callFunction(name, data = {}, options = {}) {
  try {
    const res = await wx.cloud.callFunction({
      name,
      data,
      ...options,
    });
    // 云函数返回统一结构 { code: 0, data: ..., msg: 'ok' }
    return res.result;
  } catch (err) {
    console.error(`云函数 [${name}] 调用失败:`, err);
    // 网络错误等返回统一错误结构
    return {
      code: -1,
      data: null,
      msg: err.errMsg || err.message || '网络异常，请重试',
    };
  }
}

/**
 * 上传图片到云存储
 * @param {string} filePath - 本地文件路径
 * @param {string} folder - 存储文件夹名，默认 'images'
 * @returns {Promise<string>} 云存储 fileID
 */
async function uploadImage(filePath, folder = 'images') {
  const cloudPath = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  try {
    const res = await wx.cloud.uploadFile({
      cloudPath,
      filePath,
    });
    return res.fileID;
  } catch (err) {
    console.error('图片上传失败:', err);
    throw err;
  }
}

/**
 * 从云存储获取临时链接
 * @param {string} fileID
 * @returns {Promise<string>}
 */
async function getTempFileURL(fileID) {
  try {
    const res = await wx.cloud.getTempFileURL({
      fileList: [fileID],
    });
    if (res.fileList && res.fileList.length > 0) {
      return res.fileList[0].tempFileURL;
    }
    return '';
  } catch (err) {
    console.error('获取临时链接失败:', err);
    return '';
  }
}

module.exports = {
  callFunction,
  uploadImage,
  getTempFileURL,
};
