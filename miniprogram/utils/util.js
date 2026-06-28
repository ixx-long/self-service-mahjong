/**
 * 通用工具函数
 */

/**
 * 格式化时间戳为可读字符串
 * @param {Date|string|number} date - 日期
 * @param {string} format - 格式模板，默认 'YYYY-MM-DD HH:mm:ss'
 * @returns {string}
 */
function formatTime(date, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  const second = String(d.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hour)
    .replace('mm', minute)
    .replace('ss', second);
}

/**
 * 格式化日期为中文可读字符串
 * @param {Date|string} date
 * @returns {string} 如 "6月10日 周三"
 */
function formatDateChinese(date) {
  if (!date) return '';
  const d = new Date(date);
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekDays[d.getDay()]}`;
}

/**
 * 格式化金额（元）
 * @param {number} cents - 分
 * @returns {string} 如 "¥12.00"
 */
function formatAmount(cents) {
  const yuan = (cents / 100).toFixed(2);
  return `¥${yuan}`;
}

/**
 * 格式化距离
 * @param {number} meters - 米
 * @returns {string} 如 "1.2km" 或 "500m"
 */
function formatDistance(meters) {
  if (meters == null) return '未知';
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * 格式化时长（分钟 → X时X分）
 * @param {number} minutes - 分钟数
 * @returns {string}
 */
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0分';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}时`;
  return `${h}时${m}分`;
}

/**
 * 获取今天的日期字符串
 * @returns {string} "YYYY-MM-DD"
 */
function getTodayStr() {
  return formatTime(new Date(), 'YYYY-MM-DD');
}

/**
 * 获取未来 N 天的日期字符串数组
 * @param {number} days - 天数
 * @returns {string[]}
 */
function getNextDays(days) {
  const result = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    result.push(formatTime(d, 'YYYY-MM-DD'));
  }
  return result;
}

/**
 * 计算两个时间之间的分钟差
 * @param {Date|string} start
 * @param {Date|string} end
 * @returns {number}
 */
function diffMinutes(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  return Math.round((e - s) / 60000);
}

/**
 * 手机号脱敏
 * @param {string} phone
 * @returns {string} 如 "138****1234"
 */
function maskPhone(phone) {
  if (!phone || phone.length !== 11) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(7);
}

/**
 * 防抖
 * @param {Function} fn
 * @param {number} delay - 毫秒
 */
function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

module.exports = {
  formatTime,
  formatDateChinese,
  formatAmount,
  formatDistance,
  formatDuration,
  getTodayStr,
  getNextDays,
  diffMinutes,
  maskPhone,
  debounce,
};
