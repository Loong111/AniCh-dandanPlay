# AniCh 弹弹 Play 弹幕 Userscript

[English README](./README.md)

这是一个面向 AniCh 的单文件 userscript，用来为 AniCh 播放页提供基于弹弹 Play 的弹幕匹配、加载、标准化、调度、渲染和控制功能，同时不改动 AniCh 原有的视频播放流程。

它只作用于 `https://anich.emmmm.eu.org/b/*` 页面，目标是为 AniCh 提供一个独立、可安装、以弹弹 Play 为数据来源的弹幕脚本。

## 项目用途

本项目的用途很直接：在 AniCh 上提供一个基于弹弹 Play 的弹幕脚本。它把匹配、加载、过滤、渲染和外置工具条整合到一个 userscript 里，方便直接安装和使用。

## 当前功能

- 在 AniCh 播放页使用独立弹幕渲染链路。
- 基于弹弹 Play 拉取弹幕，支持内置代理回退和自定义 API 前缀。
- 自动根据标题和集数进行匹配，也支持手动搜索和手动确认分集。
- 提供位于播放器外侧的外置工具条，避免遮挡视频画面。
- 支持字号、显示区域、不透明度、速度、时间偏移等参数调节。
- 支持弹幕类型过滤、关键词屏蔽和正则屏蔽。
- 使用 `localStorage` 持久化保存设置、匹配缓存、偏好缓存和工具条位置。
- 可在路由切换、拖动进度、暂停/恢复、全屏、播放器节点重建后重新绑定。

## 支持环境

- 浏览器 userscript 扩展：Tampermonkey 或 Violentmonkey。
- 支持页面：`https://anich.emmmm.eu.org/b/<bangumi>/<episode>`。
- 无需构建步骤、包管理器或后端服务。

## 安装方式

1. 先安装 Tampermonkey 或 Violentmonkey。
2. 将 [`anich-danmaku-fix.user.js`](./anich-danmaku-fix.user.js) 导入扩展。
3. 如果你把仓库上传到 GitHub，也可以直接使用该文件的 raw 地址安装。
4. 打开 AniCh 的 `/b/*` 播放页，在启用脚本后刷新一次页面。

## 使用说明

1. 打开 AniCh 某一集播放页面。
2. 在播放器旁边找到外置弹幕工具条。
3. 点击设置按钮打开控制面板。
4. 按需调整字号、区域、不透明度、速度、偏移等基础参数。
5. 如果自动匹配失败，进入 `匹配/来源`，搜索弹弹 Play 条目并手动确认对应分集。
6. 如果需要过滤内容，可以添加关键词规则或正则规则。

## 配置说明

- 脚本会把设置、API 配置、匹配缓存、系列偏好和工具条位置写入浏览器 `localStorage`。
- 可以在面板里填写自定义 API 前缀，用于接入你自己的弹弹 Play 兼容接口。
- 当直连不可用时，脚本会自动尝试内置代理候选地址。

## 仓库结构

- [`anich-danmaku-fix.user.js`](./anich-danmaku-fix.user.js)：主 userscript 文件。
- [`docs/analysis`](./docs/analysis)：项目概览、模块清单、风险分析。
- [`docs/plan`](./docs/plan)：任务拆解、依赖关系、里程碑。
- [`docs/progress`](./docs/progress)：阶段进度和验证记录。

## 开发方式

- 本项目刻意保持为无构建单文件脚本，主源码就是 `anich-danmaku-fix.user.js`。
- 修改脚本后，重新加载浏览器扩展中的脚本，并在真实 AniCh 播放页面中验证。
- 受 userscript 沙箱和站点实时 DOM 影响的行为，仍然需要在浏览器里手动验证。

## 已知限制

- 目前只支持 `https://anich.emmmm.eu.org/b/*`。
- 本项目只处理 AniCh 上基于弹弹 Play 的播放侧弹幕，不包含发弹幕、账号功能或跨站通用抽象。
- 自动匹配质量依赖 AniCh 页面提供的标题信息和弹弹 Play 搜索结果。
- 弹幕可用性依赖当前可访问的弹弹 Play API 或代理服务。

## 当前状态

核心功能已经完成，并且 Phase 4 所需的浏览器实机验证已经通过。
