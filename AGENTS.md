# Repository Guidelines

## 项目结构

Mindflow 是面向个人桌面的浏览器白板，使用 React、TypeScript、Vite、Excalidraw 和 lucide-react，无需后端。

- `src/main.tsx` / `src/App.tsx`：应用挂载和单白板入口。
- `src/Whiteboard.tsx` / `.css`：原生编辑器集成、工作区界面和便签入口。
- `src/CommandPalette.tsx` / `.css`：本地命令搜索与键盘选择。
- `src/whiteboardStorage.ts`：IndexedDB 场景、图片、偏好和素材库保存。
- `src/flowchart.ts` / `src/legacyFlowchart.ts`：旧版 JSON 校验和白板元素转换。
- `src/index.css`：全局样式；历史、撤销与重做使用原生编辑器。
- `public/`：静态资源；`scripts/prepare-excalidraw-assets.mjs` 自动准备本地字体。
- `docs/canvas-redesign-plan.md`：白板改造范围与验收依据。

改造期间以源码和实际验证判断进度，明确区分目标与已实现行为。旧思维导图、架构页模块已移除，不再按三模式组织新代码。

## 开发命令

使用 Node.js 22.12+，在仓库根目录执行：

```powershell
npm ci           # 按 package-lock.json 安装依赖
npm run dev      # 启动 Vite，通常为 http://localhost:5173
npm run build    # TypeScript 检查并构建到 dist/
npm run lint     # 使用 .oxlintrc.json 运行 Oxlint
npm run preview  # 构建后预览生产版本
```

## 代码风格

沿用两空格缩进、TypeScript 单引号及省略语句末尾分号。使用函数组件、React hooks 和独立的 `import type`；组件及文件用 PascalCase，工具函数用 camelCase，hook 命名为 `useSomething`。CSS 类名用 kebab-case，画布样式与组件就近维护。Oxlint 检查 hooks 规则；项目未配置独立格式化工具。

## 文档工作流

编写或更新 README、开发指南、架构说明及代码文档时，使用 DeerFlow 的
[`code-documentation`](https://github.com/bytedance/deer-flow/blob/e7d96fe05110c4aac4e03242c16ba1a65ef8842f/skills/public/code-documentation/SKILL.md)
skill，先读取 `~/.codex/skills/code-documentation/SKILL.md`，按以下项目约定裁剪其流程：

1. **分析现状**：查看 `git status`、相关差异、`package.json`、README、方案及涉及的源码，确认入口、数据流、真实行为和未完成项，保护其他未提交工作。
2. **确定范围**：README 面向使用者，说明已实现功能、启动、快捷键和备份；`docs/` 记录设计、约束、取舍及验收；AGENTS 维护贡献约定。需求变化时修订对应方案，避免重复维护同一内容。
3. **编写内容**：沿用中文和既有结构，提供可复制的 PowerShell 命令及最小操作示例。围绕当前浏览器应用说明，按需记录类型和关键函数；复杂逻辑使用 TSDoc/JSDoc。新增文档用 `docs/<topic>.md`，仅在范围需要时添加文件。
4. **核验质量**：逐项核对路径、脚本、函数签名、链接、JSON 格式、存储键和功能描述。代码示例须与实现一致；方案中的功能完成并验证后，才写为 README 的可用功能。仅改文档时检查准确性即可，验证记录只写实际执行的结果。
5. **同步交付**：功能改动同步使用说明；架构或约定变化同步 `docs/`、AGENTS 中相关段落。文档直接保存到仓库对应位置，以文件链接交付，并说明验证结果或待完成项。

## 测试与数据约束

当前无自动测试框架、`npm test`、测试命名约定或覆盖率门槛。代码改动运行 `npm run build`、`npm run lint`，并验证受影响的桌面浏览器主流程：创建/编辑、拖动/连接、复制/删除、撤销/重做、刷新恢复和 JSON 导入导出。改造验收覆盖中文多行输入、编辑时快捷键隔离、无效导入，以及 1280×800 / 1366×768 布局；旧 hash 应只进入当前画布。

新白板场景、图片、偏好和素材库保存到 IndexedDB，按浏览器源隔离。保留 `mindflow-flowchart-v1` 旧 localStorage 值，仅在无新记录时读取转换，不写回旧格式。导入必须先校验再替换内容，保留可见的保存和导入错误提示。历史由原生编辑器管理，不另建选中态等临时状态的业务历史。

## 提交与 Pull Request

提交沿用 `type: imperative summary`，例如 `docs: clarify canvas documentation workflow`，每次聚焦一项变更。PR 说明行为变化、关联问题（如有）及实际验证结果；界面变更附截图。依赖变化同步 lockfile；不提交 `node_modules/`、`dist/`、临时截图或日志。
