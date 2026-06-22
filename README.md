# WA Archive

WHJ 的个人学习档案馆：ACM 题解、课程笔记、项目记录与周报。

## 本地运行

```bash
npm install
npm run dev
```

## 写一篇文章

在 `src/content/blog/` 新建 Markdown 或 MDX 文件，填写 frontmatter 后直接写正文。题解可额外使用 `difficulty`、`platform` 和 `status` 字段。

## 部署

推送到 GitHub 仓库的 `main` 分支后，GitHub Actions 会自动构建并发布。首次部署前，在仓库的 **Settings → Pages → Build and deployment** 中将 Source 设置为 **GitHub Actions**。
