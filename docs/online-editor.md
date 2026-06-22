# WA Archive 在线编辑安全骨架

## 为什么没有直接在公开网页里填写 GitHub Token

GitHub Pages 是纯静态托管，无法安全保存 OAuth Client Secret。把个人访问令牌写进前端、`localStorage` 或仓库配置，任何脚本注入和浏览器扩展都可能读取它，因此本项目不会采用这种“省一步、埋大雷”的方案。

## 计划架构

```text
浏览器 /admin
  → GitHub OAuth 登录（仅允许 jianhuowang）
  → Serverless OAuth Broker（保存 Client Secret）
  → GitHub Contents API 创建或修改 vault/published/*.md
  → GitHub Actions 构建检查
  → GitHub Pages 更新
```

在线编辑器必须满足：

- GitHub OAuth 登录；
- 服务端校验登录用户名为 `jianhuowang`；
- OAuth Secret 只存在于 Serverless 环境变量；
- 默认创建草稿，发布前展示最终 Markdown diff；
- 不允许浏览或提交 `vault/.claudian`、`vault/inbox` 和 `vault/drafts`；
- 所有写入都形成可回滚的 Git 提交。

## 下一阶段需要用户提供的选择

需要选择一个承载 OAuth Broker 的平台（推荐 Cloudflare Workers，也可使用 Netlify Functions），并在 GitHub 创建 OAuth App。完成本地发布器试用后再配置这一层，避免同时引入两个新的操作界面。
