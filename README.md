# FIRE

一个通过引导式输入和实时图形，帮助个人或家庭理解提前退休资金与时间需求的网页小程序。

当前阶段：已建立可运行的 React + TypeScript + Vite 基础闭环（Issue #2），后续逐步加入人生节点、资产现金流、方案比较和报告。

## 计划功能

- 输入当前收入、资产、生活费和希望退休年龄，估算退休目标与预计达标时间。
- 用人生节点更新婚育后的阶段生活费，并记录一次性大额支出。
- 对比继续购买与不再购买社保医保的方案，分别填写缴费、养老金和医疗自付预算。
- 展示还需增加的每月净投入、收益情景和退休初期下跌压力测试。
- 使用滑块、精确数字输入和实时图形，支持本地保存、方案比较与导出。

默认规划至 85 岁，以今天购买力显示金额。所有结果基于用户输入和明确假设，不代表保证收益或保证可以退休。

## 设计文档

- [产品规格](docs/product-spec.md)
- [计算规格](docs/calculation-spec.md)
- [Module 设计](docs/codebase-design.md)
- [设计访谈记录](docs/product-design.md)
- [领域术语](GLOSSARY.md)
- [参考视频总结](downloads/BV1eTHZ6gENk_FIRE/summary.md)

## 运行与开发

计划使用 React、TypeScript 和 Vite。安装依赖并启动本地预览：

```bash
npm install
npm run dev
```

验证：`npm test`，`npm run build`。

原始音视频、抽帧、运行日志、私有环境配置与个人财务导出不纳入 Git。视频总结中的本地媒体链接只在已下载对应文件的工作目录中可用。
