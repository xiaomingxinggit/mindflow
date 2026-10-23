# Mindflow · 无限思维画布

一个面向个人桌面使用的自由画布。随手记下想法，拖动摆放，再用箭头连接彼此的关系。基于 React、TypeScript、Vite 和 React Flow，无需后端。

## 启动

需要 Node.js 22.12+。在项目目录运行：

```powershell
npm install
npm run dev
```

打开终端显示的地址，默认是 `http://localhost:5173`。依赖已安装时直接运行 `npm run dev` 即可。

```powershell
npm run build   # TypeScript 检查并构建到 dist/
npm run lint    # 静态检查
npm run preview # 预览生产构建
```

## 记录与连接

- 双击画布空白处，在当前位置创建一个矩形想法并立即输入。顶部图形工具也可点击放置一次，随后自动回到选择工具。
- 双击节点就地修改文字，支持中文和多行内容。Enter 换行，Ctrl / Cmd + Enter、Escape 或点击其他位置结束编辑。
- 拖动节点自由布局。从节点边缘的连接点拖到另一个节点，创建箭头；选中连线可编辑关系文字，切换折线、曲线或直线。
- 点击选择节点或连线，拖拽空白处框选。选中后显示属性浮层，可修改形状和颜色、复制或删除；删除节点会同时删除相连的线。
- 用平移工具或按住空格拖动画布，滚轮缩放。左下角提供缩放、适应全部和撤销 / 重做。
- 左上角可修改文档名，文件菜单提供新建、JSON 导入导出和网格开关。新建文档为空白画布，默认不吸附网格。

节点可以独立存在，也可以形成回路，没有中心主题或父子层级要求。文字编辑时，画布快捷键不会干扰输入。

| 快捷键 | 操作 |
| --- | --- |
| V / H | 选择 / 平移工具 |
| 按住 Space | 临时平移画布 |
| Ctrl / Cmd + A | 全选 |
| Ctrl / Cmd + D | 复制所选节点及它们之间的连线 |
| Delete / Backspace | 删除所选内容 |
| Ctrl / Cmd + Z | 撤销 |
| Ctrl / Cmd + Shift + Z，或 Ctrl / Cmd + Y | 重做 |
| Enter（节点编辑中） | 换行 |
| Ctrl / Cmd + Enter（节点编辑中） | 完成编辑 |
| Escape | 结束编辑或关闭浮层 |

## 保存与备份

文档自动保存到当前浏览器，文字在完成编辑后保存，刷新后恢复节点文字、位置和连线。保存失败时会显示提示，可通过 JSON 导出备份。一次拖动或一次连续文字编辑作为一步历史，新建和导入也可以撤销；历史仅在本次页面会话内保留。

沿用 `mindflow-flowchart-v1` 本地存储，已有流程图文档可以继续读取。JSON 导入会检查文档结构，无效文件不会覆盖当前内容。浏览器地址不同（例如 `localhost` 和 `127.0.0.1`），本地保存空间也不同，可用 JSON 迁移。

第一版提供单张当前文档和纯文本想法，主要适配 1280×800、1366×768 等桌面窗口。暂不包含图片、富文本、分组、多文档管理、协作或云同步。

## 代码位置

```text
src/App.tsx                React Flow 上下文与单画布入口
src/FlowchartBoard.tsx     画布、节点编辑、工具浮层和文件操作
src/FlowchartBoard.css     画布、节点与浮层样式
src/ThoughtNode.tsx        节点形状和就地多行编辑
src/thoughtNodeConfig.ts   节点配色与编辑上下文
src/flowchart.ts           文档类型、节点/连线模型和 JSON 校验
src/useFlowchartHistory.ts 文档历史与撤销 / 重做
src/index.css              全局基础样式和系统字体
docs/canvas-redesign-plan.md 改造范围与验收依据
```
