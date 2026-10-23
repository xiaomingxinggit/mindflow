# Mindflow · 无限白板

一个面向个人桌面的本地白板。自由记录想法、画草图、添加图片，再用箭头表达关系。使用 React、TypeScript、Vite 和 `@excalidraw/excalidraw@0.18.1`，保留 Excalidraw 原生中文界面，无需后端或账号。

## 启动

需要 Node.js 22.12+。在项目目录运行：

```powershell
npm ci
npm run dev
```

打开终端显示的地址，默认是 `http://localhost:5173`。依赖已安装时直接运行 `npm run dev`。

```powershell
npm run build   # TypeScript 检查并构建到 dist/
npm run lint    # 使用 Oxlint 静态检查
npm run preview # 预览生产构建
```

开发和构建会自动将编辑器字体复制到 `public/excalidraw/fonts/`，页面从本站加载字体。该目录是生成资源，不提交到 Git；更换依赖或全新安装后无需手动下载字体。

## 画布操作

- 顶部工具条提供矩形、菱形、椭圆、箭头、线条、画笔、独立文字和图片等工具；更多工具包括画框、橡皮与激光笔。
- 双击空白处输入文字，双击形状输入形状内文字；支持中文多行。箭头可连接形状并添加标签，移动形状后连线跟随。
- 点击、框选或按住 Shift 多选元素。可移动、缩放、旋转、复制、组合、锁定、对齐、分布和调整图层；选中后使用原生属性面板修改颜色、填充、线条、字体等样式。
- 使用平移工具或按住空格拖动画布。左下角提供缩放、适应画布与撤销 / 重做；菜单保留主题、网格和快捷键帮助等原生设置。
- 图片可通过工具选择、拖入或粘贴。应用的“便签”入口会在视口中创建浅黄色矩形和绑定文字，之后按普通图形编辑、移动或复制。
- 右侧素材库可保存选中的元素，之后重新插入，也支持原生素材库文件导入导出。
- 文件菜单的搜索或 Ctrl / Cmd + F 可查找画布中的文字。
- 文件菜单的“命令面板”或 Ctrl / Cmd + / 可打开命令搜索，输入中文筛选后，用方向键选择、Enter 执行、Escape 关闭。

绘图工具和快捷键沿用原生编辑器。常用操作如下，完整列表可从帮助菜单查看：

| 快捷键 | 操作 |
| --- | --- |
| V / H | 选择 / 平移工具 |
| R / D / O | 矩形 / 菱形 / 椭圆 |
| A / L / P / T / E | 箭头 / 线条 / 画笔 / 文字 / 橡皮 |
| 按住 Space | 临时平移画布 |
| Ctrl / Cmd + A | 全选 |
| Ctrl / Cmd + C、V、D | 复制、粘贴、创建副本 |
| Ctrl / Cmd + G | 组合 |
| Ctrl / Cmd + Shift + G | 取消组合 |
| Delete / Backspace | 删除所选内容 |
| Ctrl / Cmd + Z | 撤销 |
| Ctrl / Cmd + Shift + Z | 重做 |
| Ctrl / Cmd + F | 搜索画布文字 |
| Ctrl / Cmd + / | 打开命令面板 |
| Escape | 结束当前操作 |

## 保存与备份

左上角可以编辑文档名，并查看“保存中 / 已保存 / 保存失败”状态。场景、图片、名称、主题和视口自动保存到当前浏览器的 IndexedDB；素材库也在本地保存。刷新后恢复当前文档。撤销历史由原生编辑器管理，只在当前页面会话内保留。

通过原生文件菜单保存 `.excalidraw` 文件作为备份，之后用“打开”恢复；也可在命令面板搜索“下载画布文件”直接下载，或搜索“打开原生画布文件”选择备份。导出图片支持 PNG、SVG 和复制为图片。便签、绑定文字、连线与图片都包含在原生文件中。保存失败时仍可使用文件导出。

首次打开且没有新白板记录时，应用会读取旧 `mindflow-flowchart-v1` 并转换节点、文字、颜色和连线；原 localStorage 值保持不变。旧版 Mindflow JSON 也可以通过专用导入入口转换，旧折线 / 曲线按原生箭头近似恢复。无效旧文件会显示错误并保留当前内容；已移除的思维导图和系统架构格式不再导入。

本地数据按浏览器和地址隔离，例如 `localhost` 与 `127.0.0.1` 是两个保存空间。清理站点数据、切换浏览器或使用无痕窗口可能失去本地内容，请定期保存 `.excalidraw` 备份。当前是单文档本地产品，未接入协作、云同步、账号、Plus 或 AI 服务。

稳定包暂未提供官网的新便签工具，因此便签使用普通形状和绑定文字；命令面板由项目提供常用工具与文件命令。旧版曲线 / 折线路径为近似转换。

## 开发说明

原生编辑核心负责绘制、选择、样式、视图、素材库和历史；应用只负责本地工作区、便签、旧数据转换和资源路径。改造范围与验收依据见 [实施方案](docs/canvas-redesign-plan.md)。

```text
src/App.tsx                          单白板入口
src/Whiteboard.tsx / Whiteboard.css  原生编辑器与轻量工作区界面
src/CommandPalette.tsx / .css        本地命令搜索面板
src/whiteboardStorage.ts             IndexedDB 场景、图片、偏好与素材库保存
src/legacyFlowchart.ts               旧版节点、文字与连线转换
src/flowchart.ts                     旧版 JSON 类型和必要校验
src/index.css                       全局基础样式
scripts/prepare-excalidraw-assets.mjs 本地字体资源准备
docs/canvas-redesign-plan.md         改造范围、取舍与验收记录
```

Excalidraw 的 MIT 许可与版权声明随项目保留在 [excalidraw-LICENSE.txt](public/excalidraw-LICENSE.txt)，上游项目见 [Excalidraw 官方仓库](https://github.com/excalidraw/excalidraw)。
