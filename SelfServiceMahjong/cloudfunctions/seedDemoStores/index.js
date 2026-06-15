// 云函数：seedDemoStores
// 功能：在全国各地创建演示门店，仅供开发调试用
// 入参：{}
// 出参：{ code: 0, data: { count }, msg: 'ok' }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const DEMO_STORES = [
  { name: '北京朝阳麻将馆', address: '北京市朝阳区建国路88号', phone: '010-88886666', openTime: '09:00', closeTime: '02:00', lng: 116.4551, lat: 39.9138 },
  { name: '上海浦东茶馆', address: '上海市浦东新区陆家嘴环路958号', phone: '021-66668888', openTime: '10:00', closeTime: '03:00', lng: 121.5098, lat: 31.2330 },
  { name: '广州天河雀友会', address: '广州市天河区体育西路123号', phone: '020-33339999', openTime: '10:00', closeTime: '02:00', lng: 113.3274, lat: 23.1322 },
  { name: '深圳南山碰碰馆', address: '深圳市南山区科技园南路66号', phone: '0755-22227777', openTime: '09:30', closeTime: '01:00', lng: 113.9501, lat: 22.5318 },
  { name: '成都宽窄雀韵', address: '成都市青羊区宽窄巷子景区12号', phone: '028-55556666', openTime: '10:00', closeTime: '23:00', lng: 104.0499, lat: 30.6651 },
  { name: '重庆解放碑牌友汇', address: '重庆市渝中区解放碑步行街18号', phone: '023-77778888', openTime: '09:00', closeTime: '01:00', lng: 106.5773, lat: 29.5603 },
  { name: '武汉光谷休闲室', address: '武汉市洪山区光谷广场B座3层', phone: '027-88889999', openTime: '10:00', closeTime: '23:00', lng: 114.4042, lat: 30.5065 },
  { name: '西安城墙下棋牌', address: '西安市碑林区南大街88号', phone: '029-11112222', openTime: '09:00', closeTime: '00:00', lng: 108.9450, lat: 34.2601 },
  { name: '南京鼓楼碰碰乐', address: '南京市鼓楼区中山北路200号', phone: '025-44445555', openTime: '10:00', closeTime: '01:00', lng: 118.7826, lat: 32.0607 },
  { name: '杭州西湖茶舍', address: '杭州市西湖区龙井路99号', phone: '0571-66667777', openTime: '09:30', closeTime: '23:30', lng: 120.1436, lat: 30.2427 },
  { name: '长沙橘子洲牌社', address: '长沙市岳麓区麓山南路188号', phone: '0731-33334444', openTime: '10:00', closeTime: '02:00', lng: 112.9388, lat: 28.2298 },
  { name: '厦门鼓浪屿棋趣', address: '厦门市思明区鹭江道55号', phone: '0592-99998888', openTime: '09:00', closeTime: '00:00', lng: 118.0758, lat: 24.4513 },
  { name: '天津滨江道雅室', address: '天津市和平区滨江道208号', phone: '022-22223333', openTime: '10:00', closeTime: '23:00', lng: 117.2006, lat: 39.1225 },
  { name: '青岛海风雀馆', address: '青岛市市南区香港中路128号', phone: '0532-77776666', openTime: '09:00', closeTime: '01:00', lng: 120.3807, lat: 36.0671 },
  { name: '大连星海棋社', address: '大连市沙河口区中山路312号', phone: '0411-55558888', openTime: '10:00', closeTime: '00:00', lng: 121.5886, lat: 38.9106 },
  { name: '南充西华牌友汇', address: '四川省南充市顺庆区西华师范大学旁', phone: '15935784261', openTime: '10:00', closeTime: '02:00', lng: 106.09224, lat: 30.79653 },
];

exports.main = async (event, context) => {
  let count = 0;
  try {
    for (const s of DEMO_STORES) {
      // 检查是否已存在（按名称去重）
      const exist = await db.collection('stores').where({ name: s.name }).get();
      if (exist.data && exist.data.length > 0) {
        console.log(`跳过已存在: ${s.name}`);
        continue;
      }

      await db.collection('stores').add({
        data: {
          name: s.name,
          address: s.address,
          phone: s.phone,
          openTime: s.openTime,
          closeTime: s.closeTime,
          location: db.Geo.Point(s.lng, s.lat),
          status: 'open',
          tablesCount: 0,
          createTime: new Date(),
        },
      });
      count++;
    }

    return { code: 0, data: { count }, msg: `成功创建 ${count} 家演示门店` };
  } catch (err) {
    return { code: -1, data: null, msg: err.message };
  }
};
