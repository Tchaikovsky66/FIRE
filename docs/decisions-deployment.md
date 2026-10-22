# GitHub Pages 发布

日期：2026-10-22

用户选择先提交当前版本，再直接发布到 GitHub Pages。项目为 React、TypeScript 和 Vite 纯前端应用，无服务端和账号依赖；已有 GitHub 仓库，因此使用 GitHub Actions 构建并发布静态文件。

- 发布分支为 `main`；工作流也支持手动触发。
- Pages 专用构建命令为 `npm run build:pages`，资源前缀为 `/FIRE/`。
- 单元测试、生产构建及桌面和手机浏览器测试成功后才部署。
- 仓库保持原有私有状态。私有仓库发布 Pages 依赖账号套餐支持；站点访问权限以 GitHub Pages 设置为准。
- 个人方案仍保存在当前浏览器。新域名与本地开发地址不共享浏览器存储，迁移使用 JSON 导入导出。
- 未验证中国大陆不同网络的可用性，以及 Safari、Firefox 和真实手机的兼容性。
