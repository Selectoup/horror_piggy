# 逃离老宅

一个可以直接打开游玩的 WebGL 3D 恐怖逃脱小游戏。玩家从老宅卧室醒来，需要找到 3 条线索、打开地下室门、拿到前门钥匙并逃出去。

## 这版更新

- 追击者重做为恐怖小猪佩奇一家风格的 3D 角色：小小猪、老猪、女猪、男猪、野猪、小猪女孩等都有长鼻子、圆耳朵、发光眼、瞳孔、血泪、血脸、眼镜、帽子、胡茬、睫毛、尾巴、手脚、衣领、纽扣和衣服血痕。
- 使用生成图 `src/assets/peppa-horror-reference.png` 作为美术参考，并保留分角色 PNG 资产在 `src/assets/characters/`。游戏内角色使用稳定的 Three.js 几何模型渲染，避免贴图黑卡问题。
- 枪械可以拾取，子弹无限；射中追击者会喷溅血迹，血量归零后倒下，10 秒后复活。
- 死亡次数为 1 次，死亡后触发 3D 死亡结局动画。
- 菜单包含简单、困难、恶梦三种模式，速度、视野、激活时机和体力压力不同。

## 运行

直接双击 `index.html`，或用浏览器打开它。

## 操作

- `WASD` / 方向键：移动
- 鼠标：左右环顾、上下抬头
- 鼠标左键：开火
- `Shift`：奔跑
- `E`：调查线索、开门、拿钥匙或捡枪
- `Q`：切换已捡到的枪
- `1` / `2` / `3`：直接选择武器

手机或触屏设备会显示虚拟方向键、互动按钮和开火按钮。

## 验证

本轮已用 Edge/Playwright 截图验证：

- `tests/peppa-3d-review.png`：6 个 3D 角色同屏审查图
- `tests/peppa-gameplay-final.png`：正常游戏内实机截图

同时通过：

```bash
node --check src/main.js
node --check src/world3d.js
```

## 发布到 GitHub Pages

仓库已加入 GitHub Pages 自动部署工作流：`.github/workflows/pages.yml`。

推送到 GitHub 后，在仓库 `Settings` -> `Pages` 里把 `Source` 设为 `GitHub Actions`，之后每次推送 `main` 都会自动发布。

页面地址通常为：

```text
https://selectoup.github.io/horror_piggy/
```
