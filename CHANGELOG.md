# Changelog

## 0.3.0

- 新增 `life-map` 代码块：在笔记里就地渲染小地图，支持 center / zoom / height / tag / limit / interactive
- 笔记自身坐标会以高亮点标出，点击其他点位可跳转笔记
- 单个页面最多 6 个内嵌地图（WebGL 上下文限制），超出时降级为提示
- 代码块随笔记关闭自动释放地图资源（MarkdownRenderChild 生命周期）

## 0.2.0

- 深色模式：底图跟随主题切换（天地图/自定义瓦片用暗色遮罩，OpenFreeMap 用官方暗色样式），点位颜色不受影响
- 空状态重做：首次使用显示引导卡片（三步接入 + 示例 + 复制按钮）；筛选无结果时提供「清空筛选」
- 性能：侧边栏排序改为预计算时间戳（2 万点从 47ms 降到 5ms）；搜索文本按要素缓存
- 新增 `npm run bench` 数据管线基准、`npm run fixture` 压测数据生成
- 发布准备：LICENSE、manifest 版本 0.2.0、GitHub Actions 发版工作流、社区目录提交清单

## 0.1.0

- 首个可用版本：笔记属性 / GeoJSON / CSV / HTTP 四类数据源
- MapLibre 地图视图、聚类、图层开关、搜索、时间筛选
- 天地图 / OpenFreeMap / 自定义 XYZ 底图，无 tk 自动降级
- 侧边面板：列表 / 照片墙 / 时间轴
- 照片大图预览（键盘切换）
- 导出 GeoJSON / Markdown 清单
