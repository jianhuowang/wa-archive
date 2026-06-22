# WA Archive

WHJ 的个人学习档案馆：ACM 题解、课程笔记、项目记录与周报。

在线地址：[jianhuowang.github.io/wa-archive](https://jianhuowang.github.io/wa-archive/)

## Obsidian 工作流

在 Obsidian 中选择 **Open folder as vault**，打开本项目的 `vault` 文件夹：

```text
vault/
├── inbox/       随手记录，不公开
├── drafts/      正在整理，不公开
├── published/   网站文章，会公开
├── templates/   题解、课程和项目模板
└── assets/      Obsidian 图片附件
```

启用 Obsidian 自带的 **Templates** 核心插件后，模板目录已经预设为 `templates`。Claudian 可以在 `inbox` 和 `drafts` 中自由整理，只有你主动移入 `published` 的文章才会进入网站。

## Wiki Links

发布文章支持 Obsidian 语法：

```md
[[acm-palindrome]]
[[acm-palindrome|回文构造题]]
[[acm-palindrome#易错点]]
![[diagram.png|示意图]]
```

普通链接使用目标笔记的**文件名**。图片放在 `vault/assets`，构建时会自动同步。若公开文章链接到未发布笔记或缺失图片，构建会失败并指出具体位置，避免网站出现死链。

## 本地运行

```powershell
npm.cmd install
npm.cmd run dev
```

打开终端显示的地址，通常是 `http://localhost:4321`。运行 `npm.cmd run build` 可以在发布前检查全部内容。

## 发布

1. 将写好的笔记移入 `vault/published`；
2. 确认 frontmatter 包含 `title`、`date`、`tags`、`category`、`description`；
3. 提交并推送到 `main`；
4. GitHub Actions 自动更新网站。
